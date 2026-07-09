// ─────────────────────────────────────────────────────────────────────────────
// vertex-export — Vertex AI training data pipeline
//
// Actions:
//   export   — format tutor_chats as Vertex AI SFT JSONL, return as text
//   upload   — upload JSONL to Google Cloud Storage
//   stats    — count available training examples
//
// Output format: one JSON object per line (JSONL) per Vertex AI spec:
//   { "messages": [ {role, content}, ... ] }
//
// Requires secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GCP_SERVICE_ACCOUNT_JSON  (needs Storage Admin + Vertex AI User roles)
//   GCS_TRAINING_BUCKET       (e.g. "edora-training-data")
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGCPToken }  from '../_shared/gcp-auth.ts';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
// ── Novo system prompt (used as the "system" turn in training data) ───────────
const SYSTEM_PROMPT =
  'You are Novo, an expert AI tutor for Indian students preparing for JEE, NEET, and board exams. ' +
  'You give clear, accurate, curriculum-aligned explanations with worked examples. ' +
  'You are encouraging, use Indian context (cricket, Bollywood, everyday examples), ' +
  'and always connect concepts to NCERT textbooks.';

// Min characters for a quality training pair
const MIN_CONTENT_LEN = 40;

interface ChatRow {
  conversation_id: string | null;
  role: string;
  content: string;
  created_at: string;
  user_id: string;
}

interface TrainingMessage {
  role: 'system' | 'user' | 'model';
  content: string;
}

interface TrainingExample {
  messages: TrainingMessage[];
}

function buildTrainingExamples(rows: ChatRow[]): TrainingExample[] {
  // Group rows into conversations by proximity (same user, within 30 min window)
  const conversations: ChatRow[][] = [];
  let current: ChatRow[] = [];

  for (const row of rows) {
    if (current.length === 0) {
      current.push(row);
      continue;
    }
    const prev = current[current.length - 1];
    const gap = new Date(row.created_at).getTime() - new Date(prev.created_at).getTime();
    const sameUser = row.user_id === prev.user_id;

    if (sameUser && gap < 30 * 60 * 1000) {
      current.push(row);
    } else {
      if (current.length >= 2) conversations.push(current);
      current = [row];
    }
  }
  if (current.length >= 2) conversations.push(current);

  const examples: TrainingExample[] = [];

  for (const convo of conversations) {
    // Build sliding window: for each assistant response, include all prior turns
    for (let i = 1; i < convo.length; i++) {
      const turn = convo[i];
      if (turn.role !== 'assistant') continue;
      if (turn.content.length < MIN_CONTENT_LEN) continue;

      // Build message list up to this assistant response
      const messages: TrainingMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      for (let j = Math.max(0, i - 8); j < i; j++) {
        const r = convo[j];
        if (r.role !== 'user' && r.role !== 'assistant') continue;
        if (r.content.length < MIN_CONTENT_LEN) continue;
        messages.push({
          role: r.role === 'user' ? 'user' : 'model',
          content: r.content,
        });
      }

      // Must have at least one user turn before the assistant response
      const hasUserTurn = messages.some(m => m.role === 'user');
      if (!hasUserTurn) continue;

      messages.push({ role: 'model', content: turn.content });
      examples.push({ messages });
    }
  }

  return examples;
}

serve(withSentry('vertex-export', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Had ZERO auth — any caller could dump every student's private tutor_chats
  // (up to 100k rows) or upload them to GCS. Same internal-secret gate as the
  // other admin/cron-only pipelines.
  const secret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret || secret !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── stats ─────────────────────────────────────────────────────────────────
  if (action === 'stats') {
    const { count: totalChats } = await db
      .from('tutor_chats').select('*', { count: 'exact', head: true });
    const { count: assistantMsgs } = await db
      .from('tutor_chats').select('*', { count: 'exact', head: true })
      .eq('role', 'assistant').gte('length(content)', MIN_CONTENT_LEN);

    return json({
      total_messages:    totalChats ?? 0,
      training_eligible: assistantMsgs ?? 0,
      estimated_examples: Math.floor((assistantMsgs ?? 0) * 0.7),
    });
  }

  // ── export ────────────────────────────────────────────────────────────────
  if (action === 'export') {
    const limit = Math.min(body.limit ?? 50000, 100000);

    const { data: rows, error } = await db
      .from('tutor_chats')
      .select('id, user_id, role, content, mode, personality, created_at')
      .order('user_id', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return json({ error: error.message }, 500);

    const examples = buildTrainingExamples(rows as ChatRow[]);

    // Split 90/10 for train/validation
    const splitAt      = Math.floor(examples.length * 0.9);
    const training     = examples.slice(0, splitAt);
    const validation   = examples.slice(splitAt);

    const trainingJSONL   = training.map(e => JSON.stringify(e)).join('\n');
    const validationJSONL = validation.map(e => JSON.stringify(e)).join('\n');

    if (body.split === 'validation') {
      return new Response(validationJSONL, {
        headers: {
          ...CORS,
          'Content-Type': 'application/jsonl',
          'Content-Disposition': 'attachment; filename="validation.jsonl"',
        },
      });
    }

    if (body.format === 'download') {
      return new Response(trainingJSONL, {
        headers: {
          ...CORS,
          'Content-Type': 'application/jsonl',
          'Content-Disposition': 'attachment; filename="training.jsonl"',
        },
      });
    }

    return json({
      training_examples:   training.length,
      validation_examples: validation.length,
      total_input_rows:    rows?.length ?? 0,
      preview:             training.slice(0, 2),
    });
  }

  // ── upload ────────────────────────────────────────────────────────────────
  // Uploads training + validation JSONL to GCS for Vertex AI fine-tuning.
  if (action === 'upload') {
    const gcpSaJson  = Deno.env.get('GCP_SERVICE_ACCOUNT_JSON');
    const gcsBucket  = Deno.env.get('GCS_TRAINING_BUCKET');
    if (!gcpSaJson || !gcsBucket) {
      return json({ error: 'GCP_SERVICE_ACCOUNT_JSON and GCS_TRAINING_BUCKET secrets required' }, 500);
    }

    const sa = JSON.parse(gcpSaJson);
    const token = await getGCPToken(sa, [
      'https://www.googleapis.com/auth/devstorage.read_write',
    ]);

    const limit = Math.min(body.limit ?? 50000, 100000);
    const { data: rows } = await db
      .from('tutor_chats')
      .select('id, user_id, role, content, created_at')
      .order('user_id').order('created_at').limit(limit);

    const examples  = buildTrainingExamples((rows ?? []) as ChatRow[]);
    const splitAt   = Math.floor(examples.length * 0.9);
    const trainJSONL = examples.slice(0, splitAt).map(e => JSON.stringify(e)).join('\n');
    const valJSONL   = examples.slice(splitAt).map(e => JSON.stringify(e)).join('\n');

    const uploadFile = async (name: string, content: string) => {
      const res = await fetch(
        `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(gcsBucket)}/o?uploadType=media&name=${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/jsonl',
          },
          body: content,
        },
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`GCS upload of ${name} failed: ${res.status} ${err.slice(0, 200)}`);
      }
      return `gs://${gcsBucket}/${name}`;
    };

    const [trainingUri, validationUri] = await Promise.all([
      uploadFile('training.jsonl', trainJSONL),
      uploadFile('validation.jsonl', valJSONL),
    ]);

    return json({
      success: true,
      training_uri:   trainingUri,
      validation_uri: validationUri,
      training_examples:   splitAt,
      validation_examples: examples.length - splitAt,
    });
  }

  return json({ error: 'Unknown action. Use: stats | export | upload' }, 400);
}));
