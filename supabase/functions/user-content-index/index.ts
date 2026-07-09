// ═══════════════════════════════════════════════════════════════════════════════
// user-content-index — embed user's flashcards + study notes into private index
//
// POST body:
//   { action: 'index_flashcards',  ids?: string[] }   — embed all / specific flashcards
//   { action: 'index_notes',       ids?: string[] }   — embed all / specific study_notes
//   { action: 'index_item', source_type, source_id }  — single item (called on save)
//   { action: 'reindex_all' }                         — full reindex for this user
//   { action: 'status' }                              — count indexed vs total
//   { action: 'delete', source_type, source_id }      — remove from index
//
// Auth: user JWT required (indexes only the authenticated user's content).
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

async function embedText(text: string, geminiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: text.slice(0, 2000) }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      },
    );
    const d = await res.json() as { embedding?: { values?: number[] } };
    return d.embedding?.values ?? null;
  } catch { return null; }
}

function buildFlashcardText(front: string, back: string, subject?: string, topic?: string): string {
  return [subject && `Subject: ${subject}`, topic && `Topic: ${topic}`, `Q: ${front}`, `A: ${back}`]
    .filter(Boolean).join('\n');
}

function buildNoteText(title: string, content: string, subject?: string): string {
  return [subject && `Subject: ${subject}`, `Title: ${title}`, content].filter(Boolean).join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(req) });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const geminiKey   = Deno.env.get('GEMINI_API_KEY') ?? '';

  const jsonRes = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCors(req), 'Content-Type': 'application/json' } });

  // Auth: require user JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonRes({ error: 'Not authenticated' }, 401);

  const userDb    = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const serviceDb = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return jsonRes({ error: 'Invalid token' }, 401);

  const userId = user.id;

  try {
    const body = await req.json() as {
      action:       string;
      ids?:         string[];
      source_type?: string;
      source_id?:   string;
    };

    const rl = await checkRateLimit(serviceDb, userId, `user_content_index_${body.action}`, 40, 60);
    if (!rl.allowed) return jsonRes({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

    // ── Status ─────────────────────────────────────────────────────────────────
    if (body.action === 'status') {
      const [{ count: flashCount }, { count: noteCount }, { count: idxCount }] = await Promise.all([
        serviceDb.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        serviceDb.from('study_notes').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        serviceDb.from('user_content_index').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      return jsonRes({
        flashcards_total: flashCount ?? 0,
        notes_total:      noteCount ?? 0,
        indexed_total:    idxCount ?? 0,
      });
    }

    // ── Delete single item ─────────────────────────────────────────────────────
    if (body.action === 'delete' && body.source_type && body.source_id) {
      await serviceDb.from('user_content_index')
        .delete()
        .eq('user_id', userId)
        .eq('source_type', body.source_type)
        .eq('source_id', body.source_id);
      return jsonRes({ deleted: true });
    }

    // ── Index single item (called on flashcard/note save) ──────────────────────
    if (body.action === 'index_item' && body.source_type && body.source_id) {
      let text = '';
      let subject: string | undefined;
      let topic: string | undefined;

      if (body.source_type === 'flashcard') {
        const { data: fc } = await serviceDb.from('flashcards').select('front,back,subject,topic')
          .eq('id', body.source_id).eq('user_id', userId).maybeSingle();
        if (!fc) return jsonRes({ error: 'Not found' }, 404);
        text    = buildFlashcardText(fc.front, fc.back, fc.subject, fc.topic);
        subject = fc.subject;
        topic   = fc.topic;
      } else if (body.source_type === 'study_note') {
        const { data: note } = await serviceDb.from('study_notes').select('title,content,subject')
          .eq('id', body.source_id).eq('user_id', userId).maybeSingle();
        if (!note) return jsonRes({ error: 'Not found' }, 404);
        text    = buildNoteText(note.title, note.content ?? '', note.subject);
        subject = note.subject;
      }

      if (!text) return jsonRes({ error: 'Empty content' }, 400);

      const embedding = await embedText(text, geminiKey);
      await serviceDb.from('user_content_index').upsert({
        user_id:     userId,
        source_type: body.source_type,
        source_id:   body.source_id,
        content:     text,
        subject,
        topic,
        embedding:   embedding ? `[${embedding.join(',')}]` : null,
        indexed_at:  new Date().toISOString(),
      }, { onConflict: 'user_id,source_type,source_id' });

      return jsonRes({ indexed: 1, embedded: embedding ? 1 : 0 });
    }

    // ── Bulk index flashcards ──────────────────────────────────────────────────
    if (body.action === 'index_flashcards' || body.action === 'reindex_all') {
      let query = serviceDb.from('flashcards').select('id,front,back,subject,topic').eq('user_id', userId);
      if (body.ids?.length) query = query.in('id', body.ids);

      const { data: cards } = await query.limit(200);
      let indexed = 0, embedded = 0;

      for (const fc of (cards ?? [])) {
        const text  = buildFlashcardText(fc.front, fc.back, fc.subject, fc.topic);
        const emb   = await embedText(text, geminiKey);
        await serviceDb.from('user_content_index').upsert({
          user_id: userId, source_type: 'flashcard', source_id: fc.id,
          content: text, subject: fc.subject, topic: fc.topic,
          embedding: emb ? `[${emb.join(',')}]` : null,
          indexed_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source_type,source_id' });
        indexed++;
        if (emb) embedded++;
      }

      // Also index notes if reindex_all
      if (body.action === 'reindex_all') {
        const { data: notes } = await serviceDb.from('study_notes')
          .select('id,title,content,subject').eq('user_id', userId).limit(100);
        for (const note of (notes ?? [])) {
          const text = buildNoteText(note.title, note.content ?? '', note.subject);
          const emb  = await embedText(text, geminiKey);
          await serviceDb.from('user_content_index').upsert({
            user_id: userId, source_type: 'study_note', source_id: note.id,
            content: text, subject: note.subject,
            embedding: emb ? `[${emb.join(',')}]` : null,
            indexed_at: new Date().toISOString(),
          }, { onConflict: 'user_id,source_type,source_id' });
          indexed++;
          if (emb) embedded++;
        }
      }

      return jsonRes({ indexed, embedded });
    }

    // ── Bulk index notes ───────────────────────────────────────────────────────
    if (body.action === 'index_notes') {
      let query = serviceDb.from('study_notes').select('id,title,content,subject').eq('user_id', userId);
      if (body.ids?.length) query = query.in('id', body.ids);

      const { data: notes } = await query.limit(100);
      let indexed = 0, embedded = 0;

      for (const note of (notes ?? [])) {
        const text = buildNoteText(note.title, note.content ?? '', note.subject);
        const emb  = await embedText(text, geminiKey);
        await serviceDb.from('user_content_index').upsert({
          user_id: userId, source_type: 'study_note', source_id: note.id,
          content: text, subject: note.subject,
          embedding: emb ? `[${emb.join(',')}]` : null,
          indexed_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source_type,source_id' });
        indexed++;
        if (emb) embedded++;
      }

      return jsonRes({ indexed, embedded });
    }

    return jsonRes({ error: `Unknown action: ${body.action}` }, 400);

  } catch (err) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
