// ═══════════════════════════════════════════════════════════════════════════════
// ncert-ingest v2 — Hierarchical RAG ingestion pipeline
//
// Actions:
//   ingest      — PDF/URL → hierarchical chunks (chapter→section→paragraph) → embed → store
//   bulk_seed   — seed chapter-level summaries from ncert_chapters metadata
//   status      — indexed chunk counts by class/subject/level
//   purge       — delete all chunks for a class+subject+chapter (re-ingest)
//
// Hierarchy:
//   chapter  chunk  (1 per chapter)  — full summary, big-picture context
//   section  chunk  (N per chapter)  — 600-char sections, primary retrieval unit
//   paragraph chunk (N per section)  — 200-char snippets, precision answers
//
// Embeddings: Gemini text-embedding-004 (768-dim), task=RETRIEVAL_DOCUMENT
// Requires secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';
import { withSentry }   from '../_shared/sentry.ts';

// ── Constants ─────────────────────────────────────────────────────────────────
const SECTION_MAX_CHARS   = 600;
const PARA_WORD_WINDOW    = 44;   // ~220 chars
const CHUNK_OVERLAP_WORDS = 10;
const EMBED_BATCH         = 5;
const BATCH_DELAY_MS      = 250;

// ── Gemini embedding ──────────────────────────────────────────────────────────
async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    'models/text-embedding-004',
        content:  { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    }
  );
  if (!res.ok) throw new Error(`Embed ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const d = await res.json();
  return (d as { embedding?: { values?: number[] } }).embedding?.values ?? [];
}

// Batch embed with retry on 429
async function embedBatch(texts: string[], apiKey: string, retries = 3): Promise<Array<number[] | null>> {
  const results: Array<number[] | null> = new Array(texts.length).fill(null);
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch   = texts.slice(i, i + EMBED_BATCH);
    const settled = await Promise.allSettled(batch.map(t => embedText(t, apiKey)));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === 'fulfilled') {
        results[i + j] = r.value;
      } else if (retries > 0 && String(r.reason).includes('429')) {
        await delay(1000 * (4 - retries));
        const [retry] = await Promise.allSettled([embedText(batch[j], apiKey)]);
        if (retry.status === 'fulfilled') results[i + j] = retry.value;
      }
    }
    if (i + EMBED_BATCH < texts.length) await delay(BATCH_DELAY_MS);
  }
  return results;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// FNV-1a 32-bit hash — fast dedup key, no async needed
function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + text.length.toString(16).padStart(8, '0');
}

// ── Hierarchical chunker ──────────────────────────────────────────────────────
interface RawChunk { text: string; level: 'section' | 'paragraph'; sectionIdx: number; }

function hierarchicalChunk(text: string): RawChunk[] {
  const paras = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 30);

  const sections: string[] = [];
  let cur = '';
  const tailWords = (s: string) => s.split(/\s+/).slice(-CHUNK_OVERLAP_WORDS).join(' ');

  for (const para of paras) {
    if ((cur + '\n' + para).length > SECTION_MAX_CHARS) {
      if (cur.trim()) sections.push(cur.trim());
      cur = tailWords(cur) + ' ' + para;
    } else {
      cur = cur ? cur + '\n' + para : para;
    }
  }
  if (cur.trim()) sections.push(cur.trim());

  const chunks: RawChunk[] = [];
  sections.forEach((sec, si) => {
    chunks.push({ text: sec, level: 'section', sectionIdx: si });
    const words = sec.split(/\s+/);
    for (let wi = 0; wi < words.length; wi += PARA_WORD_WINDOW) {
      const slice = words.slice(wi, wi + PARA_WORD_WINDOW).join(' ');
      if (slice.length > 80) chunks.push({ text: slice, level: 'paragraph', sectionIdx: si });
    }
  });

  return chunks;
}

// ── PDF text extractor ────────────────────────────────────────────────────────
function extractPDFText(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes);
  const blocks: string[] = [];

  for (const m of raw.matchAll(/BT\s*([\s\S]*?)\s*ET/g)) {
    const parts: string[] = [];
    for (const sm of m[1].matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|TJ|'|")/g)) {
      const d = sm[1]
        .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
        .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
      if (d.trim()) parts.push(d.trim());
    }
    if (parts.length) blocks.push(parts.join(' '));
  }
  for (const m of raw.matchAll(/\[([^\]]+)\]\s*TJ/g)) {
    const parts: string[] = [];
    for (const sm of m[1].matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g)) {
      const d = sm[1].replace(/\\n/g, ' ').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
      if (d.trim()) parts.push(d.trim());
    }
    if (parts.length) blocks.push(parts.join(''));
  }

  return blocks.join('\n')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}

function detectContentType(text: string): string {
  const lo = text.toLowerCase();
  if (/^(example|solved example)/i.test(text.trim())) return 'example';
  if (/^(exercise|practice|try yourself)/i.test(text.trim())) return 'exercise';
  if (/is defined as|is called/i.test(lo)) return 'definition';
  if (/=\s*[a-z]/.test(lo) && text.includes('=')) return 'formula';
  if (/(first law|second law|third law|faraday|ohm|boyle)/i.test(lo)) return 'law';
  return 'paragraph';
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
Deno.serve(withSentry('ncert-ingest', async (req) => {
  const CORS = getCors(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const geminiKey   = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!geminiKey || !supabaseUrl || !serviceKey)
    return json({ error: 'Missing secrets: GEMINI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500);

  const db   = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { action } = body;

  // ── status ───────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const { data, error } = await db
      .from('ncert_content')
      .select('class_num, subject, chunk_level')
      .order('class_num');
    if (error) return json({ error: error.message }, 500);

    const summary: Record<string, { chapter: number; section: number; paragraph: number }> = {};
    for (const row of (data ?? []) as Array<{ class_num: number; subject: string; chunk_level: string }>) {
      const k = `${row.class_num}_${row.subject}`;
      if (!summary[k]) summary[k] = { chapter: 0, section: 0, paragraph: 0 };
      const lv = row.chunk_level as keyof (typeof summary)[string];
      if (lv in summary[k]) summary[k][lv]++;
    }
    return json({ total: data?.length ?? 0, by_class_subject: summary });
  }

  // ── purge ─────────────────────────────────────────────────────────────────────
  if (action === 'purge') {
    const { class_num, subject, chapter_title } = body as Record<string, unknown>;
    if (!class_num || !subject) return json({ error: 'class_num and subject required' }, 400);
    let q = db.from('ncert_content').delete()
      .eq('class_num', class_num as number)
      .eq('subject', subject as string);
    if (chapter_title) q = q.eq('chapter_title', chapter_title as string);
    const { error, count } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ purged: count ?? 0 });
  }

  // ── bulk_seed ─────────────────────────────────────────────────────────────────
  // Generates chapter-level summary chunks from ncert_chapters metadata.
  // Run once to bootstrap corpus; PDF ingest adds section/paragraph chunks on top.
  if (action === 'bulk_seed') {
    const { filter_class, filter_subject } = body as { filter_class?: number; filter_subject?: string };

    let q = db.from('ncert_chapters')
      .select('class_num, subject, chapter_num, chapter_title, description, concepts');
    if (filter_class)   q = q.eq('class_num', filter_class);
    if (filter_subject) q = q.ilike('subject', filter_subject);
    const { data: chapters, error: chErr } = await q.order('class_num').order('chapter_num');
    if (chErr) return json({ error: chErr.message }, 500);
    if (!chapters?.length) return json({ error: 'No chapters found' }, 404);

    const rows = chapters as Array<{
      class_num: number; subject: string; chapter_num: number;
      chapter_title: string; description: string; concepts: string[];
    }>;

    const summaryTexts = rows.map(ch => {
      const concepts = Array.isArray(ch.concepts) ? ch.concepts.join(', ') : '';
      return `Class ${ch.class_num} ${ch.subject} — Chapter ${ch.chapter_num}: ${ch.chapter_title}. ` +
             `${ch.description ?? ''}. Key concepts: ${concepts}.`;
    });

    const embeddings = await embedBatch(summaryTexts, geminiKey);

    let seeded = 0, skipped = 0;
    for (let i = 0; i < rows.length; i++) {
      const ch  = rows[i];
      const emb = embeddings[i];

      const { data: existing } = await db.from('ncert_content').select('id')
        .eq('class_num', ch.class_num).eq('subject', ch.subject)
        .eq('chapter_title', ch.chapter_title).eq('chunk_level', 'chapter').limit(1);
      if (existing?.length) { skipped++; continue; }

      const { error: insErr } = await db.from('ncert_content').insert({
        class_num:     ch.class_num,
        subject:       ch.subject,
        chapter_num:   ch.chapter_num,
        chapter_title: ch.chapter_title,
        section_title: null,
        content:       summaryTexts[i],
        content_type:  'paragraph',
        chunk_level:   'chapter',
        parent_id:     null,
        content_hash:  contentHash(summaryTexts[i]),
        token_count:   Math.ceil(summaryTexts[i].length / 4),
        ...(emb ? { embedding: `[${emb.join(',')}]` } : {}),
      });
      if (insErr) console.error('[bulk_seed] insert:', insErr.message);
      else seeded++;
    }

    return json({ action: 'bulk_seed', total: rows.length, seeded, skipped });
  }

  // ── ingest ────────────────────────────────────────────────────────────────────
  if (action === 'ingest') {
    const { pdf_base64, pdf_url, class_num, subject, chapter_num, chapter_title } =
      body as Record<string, unknown>;

    if (!class_num || !subject || !chapter_title)
      return json({ error: 'class_num, subject, chapter_title required' }, 400);
    if (!pdf_base64 && !pdf_url)
      return json({ error: 'pdf_base64 or pdf_url required' }, 400);

    // Fetch PDF bytes
    let pdfBytes: Uint8Array;
    if (pdf_url) {
      const r = await fetch(pdf_url as string);
      if (!r.ok) return json({ error: `PDF fetch failed: ${r.status}` }, 400);
      pdfBytes = new Uint8Array(await r.arrayBuffer());
    } else {
      const bin = atob(pdf_base64 as string);
      pdfBytes  = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) pdfBytes[i] = bin.charCodeAt(i);
    }

    const rawText = extractPDFText(pdfBytes);
    if (rawText.length < 100)
      return json({ error: 'Could not extract text — may be scanned/image PDF' }, 422);

    // Get or create chapter-level parent chunk
    let parentId: string | null = null;
    const { data: existingParent } = await db.from('ncert_content').select('id')
      .eq('class_num', class_num as number).eq('subject', subject as string)
      .eq('chapter_title', chapter_title as string).eq('chunk_level', 'chapter').limit(1);

    if (existingParent?.length) {
      parentId = (existingParent[0] as { id: string }).id;
    } else {
      const chapSummary = `Class ${class_num} ${subject} — Chapter ${chapter_num ?? ''}: ${chapter_title}. ${rawText.slice(0, 400)}...`;
      const chapEmb     = await embedText(chapSummary, geminiKey).catch(() => null);
      const { data: inserted } = await db.from('ncert_content').insert({
        class_num, subject, chapter_num: chapter_num ?? null, chapter_title,
        section_title: null, content: chapSummary, content_type: 'paragraph',
        chunk_level: 'chapter', parent_id: null,
        content_hash: contentHash(chapSummary),
        token_count: Math.ceil(chapSummary.length / 4),
        ...(chapEmb ? { embedding: `[${chapEmb.join(',')}]` } : {}),
      }).select('id').single();
      parentId = (inserted as { id: string } | null)?.id ?? null;
    }

    const rawChunks  = hierarchicalChunk(rawText);
    const texts      = rawChunks.map(c => c.text);
    const embeddings = await embedBatch(texts, geminiKey);

    let stored = 0, skipped = 0;
    const sectionIds: Record<number, string> = {};

    for (let i = 0; i < rawChunks.length; i++) {
      const chunk = rawChunks[i];
      const hash  = contentHash(chunk.text);

      const { data: dup } = await db.from('ncert_content')
        .select('id').eq('content_hash', hash).limit(1);
      if (dup?.length) { skipped++; continue; }

      const emb          = embeddings[i];
      const chunkParent  = chunk.level === 'paragraph'
        ? (sectionIds[chunk.sectionIdx] ?? parentId)
        : parentId;

      const { data: ins, error: insErr } = await db.from('ncert_content').insert({
        class_num, subject, chapter_num: chapter_num ?? null, chapter_title,
        section_title: chunk.level === 'section' ? `Section ${chunk.sectionIdx + 1}` : null,
        content:       chunk.text,
        content_type:  detectContentType(chunk.text),
        chunk_level:   chunk.level,
        parent_id:     chunkParent,
        content_hash:  hash,
        token_count:   Math.ceil(chunk.text.length / 4),
        ...(emb ? { embedding: `[${emb.join(',')}]` } : {}),
      }).select('id').single();

      if (insErr) { console.error('[ingest] insert:', insErr.message); continue; }
      if (chunk.level === 'section' && ins) {
        sectionIds[chunk.sectionIdx] = (ins as { id: string }).id;
      }
      stored++;
    }

    return json({
      success: true, class_num, subject, chapter_title,
      text_length: rawText.length, total_chunks: rawChunks.length,
      stored, skipped, parent_id: parentId,
    });
  }

  return json({ error: 'Unknown action. Use: ingest | bulk_seed | status | purge' }, 400);
}));
