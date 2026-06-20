// ─────────────────────────────────────────────────────────────────────────────
// ncert-ingest — NCERT PDF ingestion pipeline
//
// Actions:
//   ingest  — process a PDF (base64 or URL), chunk text, embed, store
//   status  — count indexed chunks
//
// Uses Gemini text-embedding-004 (768-dim) for embeddings.
// Chunks are stored in ncert_content table with pgvector HNSW index.
//
// Requires secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
// ── Chunk target sizes ────────────────────────────────────────────────────────
const CHUNK_MAX_CHARS   = 900;   // max chars per chunk (stays under embedding token limit)
const CHUNK_OVERLAP     = 80;    // overlap to preserve context at chunk boundaries
const EMBED_BATCH_SIZE  = 5;     // parallel embed requests per batch
const BATCH_DELAY_MS    = 300;   // delay between batches to avoid rate limit

// ── Gemini embedding ──────────────────────────────────────────────────────────
async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${res.status} ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.embedding?.values ?? [];
}

// ── Text chunker ──────────────────────────────────────────────────────────────
// Splits on paragraph boundaries, then hard-cuts oversized paragraphs.
function chunkText(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 40); // skip tiny fragments

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (para.length > CHUNK_MAX_CHARS) {
      // Hard-split by sentence boundaries
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
      for (const sentence of sentences) {
        if ((current + ' ' + sentence).trim().length > CHUNK_MAX_CHARS) {
          if (current.trim()) chunks.push(current.trim());
          // Keep overlap from end of previous chunk
          const words = current.split(' ');
          current = words.slice(-Math.floor(CHUNK_OVERLAP / 6)).join(' ') + ' ' + sentence;
        } else {
          current = (current + ' ' + sentence).trim();
        }
      }
    } else if ((current + '\n' + para).trim().length > CHUNK_MAX_CHARS) {
      if (current.trim()) chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── Extract text from PDF bytes using basic text extraction ──────────────────
// Note: Full Document AI integration requires Document AI API enabled in GCP.
// This implementation uses a lightweight approach: extract readable text from
// PDF bytes by looking for text streams. For production-grade extraction,
// enable Google Cloud Document AI and replace this function.
function extractTextFromPDF(bytes: Uint8Array): string {
  // PDF text extraction: find BT...ET blocks and decode text operators
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes);

  const textBlocks: string[] = [];

  // Find all text between BT and ET markers
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
  let match;

  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract string literals: (text) Tj, Tf, etc.
    const strRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|TJ|'|")/g;
    let strMatch;
    const lineTexts: string[] = [];
    while ((strMatch = strRegex.exec(block)) !== null) {
      // Decode PDF escape sequences
      const decoded = strMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      if (decoded.trim()) lineTexts.push(decoded.trim());
    }
    if (lineTexts.length > 0) textBlocks.push(lineTexts.join(' '));
  }

  // Also extract array-form text: [(text) ...] TJ
  const arrayTextRegex = /\[([^\]]+)\]\s*TJ/g;
  while ((match = arrayTextRegex.exec(raw)) !== null) {
    const arrayContent = match[1];
    const strParts: string[] = [];
    const partRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    let partMatch;
    while ((partMatch = partRegex.exec(arrayContent)) !== null) {
      const decoded = partMatch[1]
        .replace(/\\n/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (decoded.trim()) strParts.push(decoded.trim());
    }
    if (strParts.length > 0) textBlocks.push(strParts.join(''));
  }

  return textBlocks
    .join('\n')
    .replace(/[^\x20-\x7E\n\r\t -ɏ]/g, ' ') // keep printable ASCII + Latin extended
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}

// ── Content type heuristic ────────────────────────────────────────────────────
function detectContentType(text: string): string {
  const lower = text.toLowerCase();
  if (/^(example|solved example|illustration)/i.test(text.trim())) return 'example';
  if (/^(exercise|practice|try yourself|do yourself)/i.test(text.trim())) return 'exercise';
  if (/definition:|is defined as|is called/i.test(lower)) return 'definition';
  if (/formula:|equation:|=\s*[a-z]/i.test(lower) && text.includes('=')) return 'formula';
  if (/(first law|second law|third law|newton|faraday|ohm|boyle|charles)/i.test(lower)) return 'law';
  return 'paragraph';
}

serve(withSentry('ncert-ingest', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const geminiKey   = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!geminiKey || !supabaseUrl || !serviceKey) {
    return json({ error: 'Missing required secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const db = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── status ────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const { count, error } = await db
      .from('ncert_content')
      .select('*', { count: 'exact', head: true });
    if (error) return json({ error: error.message }, 500);
    return json({ indexed_chunks: count ?? 0 });
  }

  // ── ingest ────────────────────────────────────────────────────────────────
  if (action === 'ingest') {
    const {
      pdf_base64,      // base64-encoded PDF bytes (mutually exclusive with pdf_url)
      pdf_url,         // publicly accessible PDF URL
      class_num,       // e.g. 11
      subject,         // e.g. "Physics"
      chapter_num,     // e.g. 5
      chapter_title,   // e.g. "Laws of Motion"
    } = body;

    if (!class_num || !subject || !chapter_title) {
      return json({ error: 'class_num, subject, and chapter_title are required' }, 400);
    }
    if (!pdf_base64 && !pdf_url) {
      return json({ error: 'Either pdf_base64 or pdf_url is required' }, 400);
    }

    // Fetch PDF bytes
    let pdfBytes: Uint8Array;
    if (pdf_url) {
      const fetchRes = await fetch(pdf_url);
      if (!fetchRes.ok) return json({ error: `Failed to fetch PDF from URL: ${fetchRes.status}` }, 400);
      const buf = await fetchRes.arrayBuffer();
      pdfBytes = new Uint8Array(buf);
    } else {
      // Decode base64
      const binaryStr = atob(pdf_base64);
      pdfBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        pdfBytes[i] = binaryStr.charCodeAt(i);
      }
    }

    // Extract text
    const rawText = extractTextFromPDF(pdfBytes);
    if (rawText.length < 100) {
      return json({ error: 'Could not extract meaningful text from PDF. The file may be scanned/image-based.' }, 422);
    }

    // Chunk text
    const chunks = chunkText(rawText);
    if (chunks.length === 0) return json({ error: 'No chunks produced from extracted text' }, 422);

    // Embed and store in batches
    let stored = 0;
    let skipped = 0;

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);

      await Promise.all(batch.map(async (chunkText) => {
        // Deduplicate: skip if this exact content+chapter already exists
        const { data: existing } = await db
          .from('ncert_content')
          .select('id')
          .eq('class_num', class_num)
          .eq('subject', subject)
          .eq('chapter_title', chapter_title)
          .ilike('content', chunkText.slice(0, 60))
          .limit(1);

        if (existing && existing.length > 0) { skipped++; return; }

        try {
          const embedding = await embedText(chunkText, geminiKey);
          const contentType = detectContentType(chunkText);

          await db.from('ncert_content').insert({
            class_num,
            subject,
            chapter_num: chapter_num ?? null,
            chapter_title,
            section_title: null,
            content: chunkText,
            content_type: contentType,
            embedding: `[${embedding.join(',')}]`,
          });
          stored++;
        } catch (err: unknown) {
          console.error('[ncert-ingest] chunk embed error:', err instanceof Error ? err.message : String(err));
        }
      }));

      // Rate-limit backoff between batches
      if (i + EMBED_BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    return json({
      success: true,
      total_chunks: chunks.length,
      stored,
      skipped,
      text_length: rawText.length,
      class_num,
      subject,
      chapter_title,
    });
  }

  return json({ error: 'Unknown action. Use: ingest | status' }, 400);
}));
