// ─────────────────────────────────────────────────────────────────────────────
// curriculum-builder  — Tier 2 Feature: Curriculum Builder
//
// Actions:
//   list_boards       — return all exam boards (with optional filters)
//   get_or_generate   — return cached curriculum or trigger AI generation
//   get_topic_tree    — return full topic tree for a curriculum_id
//   enroll            — enroll user in a curriculum & unlock first topics
//   unenroll          — soft-delete enrollment
//   get_user_progress — return user's topic statuses for a curriculum
//   complete_topic    — mark topic complete, unlock next topics
//   generate_sr_cards — generate SM-2 cards from a completed topic (Gemini)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY  = Deno.env.get('GEMINI_API_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ok() and err() are defined per-request inside the handler (below) so they
// can use the origin-allowlisted CORS headers from getCors(req). These module-
// level stubs are never called — they exist only so TypeScript resolves the names
// before the handler body is parsed. The handler shadows them immediately.
// deno-lint-ignore no-unused-vars
function ok(_data: unknown): Response  { throw new Error('unreachable'); }
// deno-lint-ignore no-unused-vars
function err(_msg: string, _code = 400): Response { throw new Error('unreachable'); }

// ── Gemini JSON helper ────────────────────────────────────────────────────────
async function geminiJSONOnce<T>(prompt: string): Promise<T> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  return JSON.parse(raw) as T;
}

// This previously made a single attempt with no retry at all — any transient
// error or malformed JSON failed curriculum/flashcard generation outright.
// validateFn lets each caller enforce its own shape (non-empty array, etc.)
// inside the same retry loop instead of discovering emptiness afterward.
async function geminiJSON<T>(prompt: string, validateFn?: (v: T) => boolean, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await geminiJSONOnce<T>(prompt);
      if (validateFn && !validateFn(result)) throw new Error('Gemini response failed validation');
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to get valid JSON from Gemini');
}

// ── Topic generation via Gemini ───────────────────────────────────────────────
interface TopicNode {
  title:           string;
  description:     string;
  estimated_hours: number;
  difficulty:      number;          // 1-5
  children?:       TopicNode[];
}

async function generateTopicTree(boardName: string, subject: string, boardLevel: string): Promise<TopicNode[]> {
  const prompt = `You are an expert curriculum designer.
Generate a comprehensive, exam-aligned topic tree for:
  Exam / Board: ${boardName}
  Subject: ${subject}
  Level: ${boardLevel}

Return ONLY valid JSON — an array of chapter objects (top-level topics). Each chapter can have children (sections) which can have children (subsections, max depth 2).

Format:
[
  {
    "title": "Chapter title",
    "description": "What this chapter covers",
    "estimated_hours": 8,
    "difficulty": 3,
    "children": [
      {
        "title": "Section title",
        "description": "What this section covers",
        "estimated_hours": 2,
        "difficulty": 3,
        "children": [
          {
            "title": "Subsection title",
            "description": "Specific concept",
            "estimated_hours": 0.5,
            "difficulty": 3
          }
        ]
      }
    ]
  }
]

Rules:
- Generate 6-12 top-level chapters that genuinely match the real ${boardName} ${subject} syllabus
- Each chapter should have 3-6 sections
- difficulty: 1=very easy, 2=easy, 3=medium, 4=hard, 5=very hard
- estimated_hours: realistic self-study hours per topic
- Be precise to the actual exam board's syllabus content`;

  return geminiJSON<TopicNode[]>(prompt, v => Array.isArray(v) && v.length > 0 && v.every(n => !!n.title));
}

// ── Flatten tree into DB rows ─────────────────────────────────────────────────
interface FlatTopic {
  title:           string;
  description:     string;
  estimated_hours: number;
  difficulty:      number;
  position:        number;
  depth:           number;
  parent_title:    string | null;
}

function flattenTree(nodes: TopicNode[], depth = 0, parentTitle: string | null = null): FlatTopic[] {
  const flat: FlatTopic[] = [];
  nodes.forEach((node, i) => {
    flat.push({
      title:           node.title,
      description:     node.description ?? '',
      estimated_hours: Math.max(0.5, Math.min(40, node.estimated_hours ?? 2)),
      difficulty:      Math.max(1, Math.min(5, node.difficulty ?? 3)),
      position:        i,
      depth,
      parent_title:    parentTitle,
    });
    if (node.children?.length) {
      flat.push(...flattenTree(node.children, depth + 1, node.title));
    }
  });
  return flat;
}

// ── Persist topics to DB ──────────────────────────────────────────────────────
async function persistTopics(curriculumId: string, flat: FlatTopic[]) {
  // Insert in order; track title → id for parent resolution
  const titleToId: Record<string, string> = {};

  for (const t of flat) {
    const parentId = t.parent_title ? (titleToId[t.parent_title] ?? null) : null;
    const { data, error } = await db
      .from('curriculum_topics')
      .insert({
        curriculum_id:   curriculumId,
        parent_topic_id: parentId,
        title:           t.title,
        description:     t.description,
        estimated_hours: t.estimated_hours,
        difficulty:      t.difficulty,
        position:        t.position,
        depth:           t.depth,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Insert topic failed: ${error.message}`);
    titleToId[t.title] = data.id;
  }
  return titleToId;
}

// ── Build topic tree from DB for response ─────────────────────────────────────
async function fetchTopicTree(curriculumId: string) {
  const { data: topics } = await db
    .from('curriculum_topics')
    .select('*')
    .eq('curriculum_id', curriculumId)
    .order('depth', { ascending: true })
    .order('position', { ascending: true });

  if (!topics) return [];

  // Build tree from flat list
  const map: Record<string, any> = {};
  const roots: any[] = [];

  for (const t of topics) {
    map[t.id] = { ...t, children: [] };
  }
  for (const t of topics) {
    if (t.parent_topic_id && map[t.parent_topic_id]) {
      map[t.parent_topic_id].children.push(map[t.id]);
    } else {
      roots.push(map[t.id]);
    }
  }
  return roots;
}

// ── Unlock topics that have all prerequisites met ─────────────────────────────
async function unlockAvailableTopics(userId: string, curriculumId: string) {
  // Get all topics in the curriculum
  const { data: topics } = await db
    .from('curriculum_topics')
    .select('id, parent_topic_id, depth')
    .eq('curriculum_id', curriculumId);

  if (!topics?.length) return;

  // Get user's current progress
  const { data: progress } = await db
    .from('user_topic_progress')
    .select('topic_id, status')
    .eq('user_id', userId)
    .in('topic_id', topics.map(t => t.id));

  const progressMap: Record<string, string> = {};
  for (const p of progress ?? []) {
    progressMap[p.topic_id] = p.status;
  }

  // Get prerequisites
  const { data: prereqs } = await db
    .from('curriculum_prerequisites')
    .select('topic_id, required_topic_id')
    .in('topic_id', topics.map(t => t.id));

  const prereqMap: Record<string, string[]> = {};
  for (const p of prereqs ?? []) {
    if (!prereqMap[p.topic_id]) prereqMap[p.topic_id] = [];
    prereqMap[p.topic_id].push(p.required_topic_id);
  }

  // Determine which topics should become 'available'
  for (const topic of topics) {
    const current = progressMap[topic.id];
    if (current === 'complete') continue;
    if (current === 'available' || current === 'in_progress') continue;

    // Top-level topics (no parent, depth=0) are always available
    const isRoot = !topic.parent_topic_id || topic.depth === 0;
    const prereqIds = prereqMap[topic.id] ?? [];
    const allPrereqsMet = prereqIds.every(pid => progressMap[pid] === 'complete');

    if (isRoot || allPrereqsMet) {
      await db.from('user_topic_progress').upsert({
        user_id:  userId,
        topic_id: topic.id,
        status:   'available',
      }, { onConflict: 'user_id,topic_id', ignoreDuplicates: true });
    }
  }
}

// ── SM-2 card generation from a completed topic ───────────────────────────────
interface SRCard { front: string; back: string; }

async function generateCardsForTopic(topicTitle: string, topicDescription: string, subject: string): Promise<SRCard[]> {
  const prompt = `You are creating spaced repetition flashcards for a student who just studied this topic:
Subject: ${subject}
Topic: ${topicTitle}
Description: ${topicDescription}

Generate 5-8 high-quality flashcard pairs. Focus on key concepts, definitions, and important facts.

Return ONLY valid JSON array:
[
  { "front": "Question or prompt on card front", "back": "Answer or explanation on card back" }
]

Rules:
- front should be a clear question or cloze prompt
- back should be concise but complete (2-4 sentences max)
- Cover different aspects of the topic (definitions, applications, examples)
- Avoid trivial or overly simple questions`;

  return geminiJSON<SRCard[]>(prompt, v => Array.isArray(v) && v.length > 0 && v.every(c => !!c.front && !!c.back));
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
Deno.serve(withSentry('curriculum-builder', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  // Shadow the unreachable module-level stubs with CORS-correct versions.
  const ok  = (data: unknown) => json(data, 200);
  const err = (msg: string, code = 400) => json({ error: msg }, code);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Verify JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Missing authorization', 401);

  const { data: { user }, error: authErr } = await createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!)
    .auth.getUser(authHeader.replace('Bearer ', ''));

  if (authErr || !user) return err('Unauthorized', 401);
  const userId = user.id;

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const { action } = body;

  const rl = await checkRateLimit(db, userId, `curriculum_builder_${action}`, 25, 60);
  if (!rl.allowed) return err('Too many requests. Try again later.', 429);

  // ── 1. list_boards ──────────────────────────────────────────────────────────
  if (action === 'list_boards') {
    const { region, level, search } = body;
    let q = db.from('exam_boards').select('*').order('region').order('name');
    if (region) q = q.eq('region', region);
    if (level)  q = q.eq('level', level);
    if (search) q = q.ilike('name', `%${search}%`);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok({ boards: data });
  }

  // ── 2. get_or_generate ──────────────────────────────────────────────────────
  if (action === 'get_or_generate') {
    const { exam_board_id, subject } = body;
    if (!exam_board_id || !subject) return err('exam_board_id and subject required');

    // Check cache
    const { data: existing } = await db
      .from('curricula')
      .select('*')
      .eq('exam_board_id', exam_board_id)
      .eq('subject', subject)
      .maybeSingle();

    if (existing?.status === 'complete') {
      const tree = await fetchTopicTree(existing.id);
      return ok({ curriculum: existing, topics: tree, cached: true });
    }

    if (existing?.status === 'generating') {
      return ok({ curriculum: existing, topics: [], cached: false, generating: true });
    }

    // Fetch board info
    const { data: board } = await db.from('exam_boards').select('*').eq('id', exam_board_id).single();
    if (!board) return err('Exam board not found');

    // Create curriculum row
    const { data: curriculum, error: createErr } = await db
      .from('curricula')
      .upsert({ exam_board_id, subject, status: 'generating' }, { onConflict: 'exam_board_id,subject,syllabus_year' })
      .select()
      .single();

    if (createErr) return err(createErr.message);

    // Generate topics (synchronous — edge functions run fast enough)
    try {
      const topicTree = await generateTopicTree(board.name, subject, board.level);
      const flat      = flattenTree(topicTree);
      await persistTopics(curriculum.id, flat);

      await db.from('curricula').update({
        status:       'complete',
        topic_count:  flat.length,
        generated_at: new Date().toISOString(),
      }).eq('id', curriculum.id);

      const tree = await fetchTopicTree(curriculum.id);
      return ok({ curriculum: { ...curriculum, status: 'complete', topic_count: flat.length }, topics: tree, cached: false });
    } catch (e: any) {
      await db.from('curricula').update({ status: 'failed' }).eq('id', curriculum.id);
      return err(`Generation failed: ${e.message}`);
    }
  }

  // ── 3. get_topic_tree ───────────────────────────────────────────────────────
  if (action === 'get_topic_tree') {
    const { curriculum_id } = body;
    if (!curriculum_id) return err('curriculum_id required');
    const tree = await fetchTopicTree(curriculum_id);
    return ok({ topics: tree });
  }

  // ── 4. enroll ───────────────────────────────────────────────────────────────
  if (action === 'enroll') {
    const { curriculum_id, target_date } = body;
    if (!curriculum_id) return err('curriculum_id required');

    const { error: enErr } = await db.from('user_curriculum_enrollments').upsert({
      user_id:       userId,
      curriculum_id,
      target_date:   target_date ?? null,
      is_active:     true,
    }, { onConflict: 'user_id,curriculum_id' });

    if (enErr) return err(enErr.message);

    // Unlock top-level topics
    await unlockAvailableTopics(userId, curriculum_id);

    const { data: progress } = await db
      .from('user_topic_progress')
      .select('*')
      .eq('user_id', userId);

    return ok({ enrolled: true, progress });
  }

  // ── 5. unenroll ─────────────────────────────────────────────────────────────
  if (action === 'unenroll') {
    const { curriculum_id } = body;
    if (!curriculum_id) return err('curriculum_id required');
    await db.from('user_curriculum_enrollments')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('curriculum_id', curriculum_id);
    return ok({ unenrolled: true });
  }

  // ── 6. get_user_progress ────────────────────────────────────────────────────
  if (action === 'get_user_progress') {
    const { curriculum_id } = body;
    if (!curriculum_id) return err('curriculum_id required');

    // Get all topic IDs for this curriculum
    const { data: topics } = await db
      .from('curriculum_topics')
      .select('id')
      .eq('curriculum_id', curriculum_id);

    const topicIds = (topics ?? []).map(t => t.id);

    const { data: progress } = await db
      .from('user_topic_progress')
      .select('*')
      .eq('user_id', userId)
      .in('topic_id', topicIds);

    const { data: enrollment } = await db
      .from('user_curriculum_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('curriculum_id', curriculum_id)
      .maybeSingle();

    return ok({ progress: progress ?? [], enrollment });
  }

  // ── 7. complete_topic ───────────────────────────────────────────────────────
  if (action === 'complete_topic') {
    const { topic_id, mastery_score } = body;
    if (!topic_id) return err('topic_id required');

    const ms = Math.max(0, Math.min(1, mastery_score ?? 0.7));

    await db.from('user_topic_progress').upsert({
      user_id:        userId,
      topic_id,
      status:         'complete',
      mastery_score:  ms,
      completed_at:   new Date().toISOString(),
      last_studied_at: new Date().toISOString(),
    }, { onConflict: 'user_id,topic_id' });

    // Get curriculum_id from topic
    const { data: topic } = await db
      .from('curriculum_topics')
      .select('curriculum_id, title, description, difficulty')
      .eq('id', topic_id)
      .single();

    if (topic?.curriculum_id) {
      await unlockAvailableTopics(userId, topic.curriculum_id);
    }

    return ok({ completed: true });
  }

  // ── 8. generate_sr_cards ────────────────────────────────────────────────────
  if (action === 'generate_sr_cards') {
    const { topic_id, subject } = body;
    if (!topic_id || !subject) return err('topic_id and subject required');

    const { data: topic } = await db
      .from('curriculum_topics')
      .select('title, description')
      .eq('id', topic_id)
      .single();

    if (!topic) return err('Topic not found');

    const cards = await generateCardsForTopic(topic.title, topic.description ?? '', subject);

    const rows = cards.map(c => ({
      user_id:         userId,
      subject,
      topic:           topic.title,
      source_type:     'curriculum' as const,
      source_id:       topic_id,
      front:           c.front,
      back:            c.back,
      next_review_date: new Date().toISOString().slice(0, 10),
    }));

    if (rows.length) {
      const { error: insertErr } = await db.from('sr_cards').insert(rows);
      if (insertErr) return err(insertErr.message);
    }

    return ok({ cards_created: rows.length, cards: rows });
  }

  return err(`Unknown action: ${action}`, 400);
}));
