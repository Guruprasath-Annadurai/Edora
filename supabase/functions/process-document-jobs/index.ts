// ═══════════════════════════════════════════════════════════════
// Edora — process-document-jobs Edge Function
//
// Background worker for the document_jobs queue (see migration
// add_document_jobs_async_queue). Invoked on a schedule by pg_cron
// (every 2 minutes — this is user-facing latency, not a nightly batch),
// never directly by the client.
//
// Claims a small batch of pending jobs, generates a study pack for each
// via Gemini (same retry+validate pattern as study-pack-generator), and
// writes the result back. Failed jobs are retried up to 3 times before
// being marked 'failed' with the last error for the client to surface.
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSentry } from '../_shared/sentry.ts';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const MAX_TEXT_CHARS = 12_000;
const REQUEST_TIMEOUT_MS = 45_000;
const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    flashcards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { front: { type: 'STRING' }, back: { type: 'STRING' } },
        required: ['front', 'back'],
      },
    },
    quiz: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question:       { type: 'STRING' },
          options:        { type: 'ARRAY', items: { type: 'STRING' } },
          correct_answer: { type: 'INTEGER' },
          explanation:    { type: 'STRING' },
        },
        required: ['question', 'options', 'correct_answer', 'explanation'],
      },
    },
    key_terms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { term: { type: 'STRING' }, definition: { type: 'STRING' } },
        required: ['term', 'definition'],
      },
    },
  },
  required: ['summary', 'flashcards', 'quiz', 'key_terms'],
};

type StudyPack = {
  summary: string;
  flashcards: Array<{ front: string; back: string }>;
  quiz: Array<{ question: string; options: string[]; correct_answer: number; explanation: string }>;
  key_terms: Array<{ term: string; definition: string }>;
};

function buildPrompt(text: string, fileName: string): string {
  return `You are an expert educational content creator. A student has uploaded a document called "${fileName}".

Analyze the text carefully and generate a complete study pack with:
1. A clear, comprehensive summary (3–4 paragraphs covering all major topics)
2. Exactly 10 flashcards (the most important concepts as question→answer pairs)
3. Exactly 5 multiple-choice quiz questions (4 options each, correct_answer is 0-indexed)
4. Exactly 10 key terms with precise, student-friendly definitions

Make everything directly based on the provided text. Be specific, not generic.

TEXT TO ANALYZE:
---
${text}
---`;
}

async function generatePack(text: string, fileName: string, apiKey: string): Promise<StudyPack> {
  const truncated = text.slice(0, MAX_TEXT_CHARS);
  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(truncated, fileName) }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let lastErr = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
        lastErr = errBody?.error?.message ?? `Gemini HTTP ${res.status}`;
        continue;
      }

      const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      const candidate = JSON.parse(cleaned) as StudyPack;

      if (!candidate.summary || !Array.isArray(candidate.flashcards) || !Array.isArray(candidate.quiz) || !Array.isArray(candidate.key_terms)) {
        lastErr = 'Invalid study pack structure from Gemini';
        continue;
      }
      return candidate;
    } catch (e) {
      clearTimeout(timeoutId);
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Failed after ${MAX_ATTEMPTS} attempts: ${lastErr}`);
}

serve(withSentry('process-document-jobs', async (req) => {
  const cronSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500 });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: pending } = await db
    .from('document_jobs')
    .select('id, user_id, file_name, pdf_path, extracted_text, char_count, page_count, attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  let processed = 0;
  let failed = 0;

  for (const job of pending ?? []) {
    // Claim: only proceed if we're the one flipping pending -> processing.
    // Guards against a slow-running previous invocation still holding this
    // row if cron ever overlaps itself.
    const { data: claimed } = await db
      .from('document_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    try {
      const pack = await generatePack(job.extracted_text, job.file_name, apiKey);

      const { data: saved, error: dbErr } = await db
        .from('study_packs')
        .insert({
          user_id:    job.user_id,
          file_name:  job.file_name,
          pdf_path:   job.pdf_path,
          summary:    pack.summary,
          flashcards: pack.flashcards,
          quiz:       pack.quiz,
          key_terms:  pack.key_terms,
          page_count: job.page_count,
          char_count: job.char_count,
        })
        .select('id')
        .single();

      if (dbErr || !saved) throw new Error(dbErr?.message ?? 'Failed to save study pack');

      await db.from('document_jobs').update({
        status: 'completed',
        study_pack_id: saved.id,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);

      processed++;
    } catch (e) {
      const newAttempts = (job.attempts ?? 0) + 1;
      const errMsg = e instanceof Error ? e.message : String(e);
      const giveUp = newAttempts >= MAX_ATTEMPTS;

      await db.from('document_jobs').update({
        status:     giveUp ? 'failed' : 'pending', // re-queue for the next cron tick if attempts remain
        attempts:   newAttempts,
        error:      errMsg.slice(0, 2000),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);

      failed++;
      console.error(`[process-document-jobs] job ${job.id} failed (attempt ${newAttempts}):`, errMsg);
    }
  }

  return new Response(JSON.stringify({ scanned: pending?.length ?? 0, processed, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}));
