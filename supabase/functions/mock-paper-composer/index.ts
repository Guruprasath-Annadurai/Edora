// mock-paper-composer — reasons over REAL pyq_content questions to select and
// sequence a well-constructed paper. Supports difficulty_skew: 'balanced'
// (default, easy-to-hard mock exam curve) or 'hard' (Advanced Mix —
// consistently difficult, cross-chapter practice for serious aspirants).
// The model NEVER invents question content — it only selects IDs from a real
// candidate pool and gives a rationale. Composed papers are cached (rotating
// variants per exam+skew+section config) so most requests are instant.
// Action: compose (any authenticated user)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const VARIANT_COUNT = 3;

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }) },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
}

async function nemotron(prompt: string): Promise<string> {
  const key = Deno.env.get('NVIDIA_API_KEY');
  if (!key) throw new Error('NVIDIA_API_KEY not configured');
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? '{}';
}

interface Candidate {
  id: string; chapter: string | null; difficulty: string | null; question_type: string | null; marks: number | null;
}
interface SectionPlan { subject: string; ordered_ids: string[]; rationale: string }

serve(withSentry('mock-paper-composer', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action, exam, sections, difficulty_skew } = body as {
    action?: string; exam?: string; sections?: { subject: string; count: number }[];
    difficulty_skew?: 'balanced' | 'hard';
  };
  const skew: 'balanced' | 'hard' = difficulty_skew === 'hard' ? 'hard' : 'balanced';

  if (action !== 'compose') return json({ error: 'Unknown action' }, 400);
  if (!exam || !Array.isArray(sections) || sections.length === 0) {
    return json({ error: 'exam and sections are required' }, 400);
  }

  const rl = await checkRateLimit(supabase, user.id, 'mock_paper_composer', 20, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const configKey = JSON.stringify({ exam, skew, sections: sections.map(s => ({ subject: s.subject, count: s.count })) });
  const configHash = await sha256Hex(configKey);
  const variant = Math.floor(Math.random() * VARIANT_COUNT);
  const paperKey = `${configHash}_v${variant}`;

  const { data: cached } = await supabase
    .from('composed_mock_papers')
    .select('*')
    .eq('paper_key', paperKey)
    .maybeSingle();

  if (cached) {
    return json({ question_ids: cached.question_ids, model_used: cached.model_used, cached: true });
  }

  const sectionPlans: SectionPlan[] = [];
  let modelUsed = 'gemini-flash-latest';

  for (const sec of sections) {
    const { data: pool } = await supabase
      .from('pyq_content')
      .select('id, chapter, difficulty, question_type, marks')
      .eq('exam', exam)
      .eq('subject', sec.subject)
      .limit(Math.max(sec.count * 4, 40));

    const candidates = (pool ?? []) as Candidate[];
    if (candidates.length === 0) {
      sectionPlans.push({ subject: sec.subject, ordered_ids: [], rationale: 'No candidate questions available for this subject.' });
      continue;
    }

    if (candidates.length <= sec.count) {
      sectionPlans.push({ subject: sec.subject, ordered_ids: candidates.map(c => c.id), rationale: 'Pool size matched requested count — no selection needed.' });
      continue;
    }

    const candidateSummary = candidates.map(c => ({ id: c.id, chapter: c.chapter, difficulty: c.difficulty, type: c.question_type, marks: c.marks }));
    const difficultyRule = skew === 'hard'
      ? `3. This is an ADVANCED/TOUGHEST practice set — prioritize hard-tagged questions first, then medium; only include easy questions if there aren't enough hard/medium ones to reach ${sec.count}. Do not build an easy-to-hard ramp — this set should stay consistently difficult throughout.`
      : `3. Difficulty curve: start easier, build to harder, roughly even mix of easy/medium/hard if available.`;
    const prompt = `You are setting a ${sec.subject} section of a ${exam} ${skew === 'hard' ? 'advanced/toughest-tier practice' : 'mock exam'} paper. Select exactly ${sec.count} question IDs from the candidate pool below and order them.

Candidate pool (JSON array of {id, chapter, difficulty, type, marks}):
${JSON.stringify(candidateSummary)}

Real exam-paper-setting rules:
1. Select exactly ${sec.count} IDs from the pool — do not invent IDs not in the list.
2. Spread across different chapters — avoid clustering multiple questions from the same chapter unless the pool has no alternative.
${difficultyRule}
4. Prefer question_type diversity if the pool has multiple types.
5. Order the final list as the student will see it${skew === 'hard' ? ' (hardest concept-diversity first, no easy ramp)' : ' (easy-to-hard sequencing)'}.

Respond with ONLY this JSON shape:
{ "ordered_ids": ["id1", "id2", ...], "rationale": "2-3 sentences on your selection/ordering logic" }`;

    let raw: string;
    try {
      raw = await nemotron(prompt);
      modelUsed = 'nemotron-3-ultra-550b';
    } catch (e) {
      console.error('Nemotron paper composition failed, falling back to Gemini:', e);
      raw = await gemini(prompt);
      modelUsed = 'gemini-flash-latest';
    }

    let parsed: { ordered_ids?: string[]; rationale?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const validIds = new Set(candidates.map(c => c.id));
    const cleanIds = (parsed.ordered_ids ?? []).filter(id => validIds.has(id));
    const difficultyRank: Record<string, number> = { hard: 0, medium: 1, easy: 2 };
    const fallbackPool = skew === 'hard'
      ? [...candidates].sort((a, b) => (difficultyRank[a.difficulty ?? 'medium'] ?? 1) - (difficultyRank[b.difficulty ?? 'medium'] ?? 1))
      : candidates;
    const finalIds = cleanIds.length === sec.count ? cleanIds : fallbackPool.slice(0, sec.count).map(c => c.id);

    sectionPlans.push({ subject: sec.subject, ordered_ids: finalIds, rationale: parsed.rationale ?? 'Fallback selection — model output could not be validated.' });
  }

  const questionIds = Object.fromEntries(sectionPlans.map(p => [p.subject, p.ordered_ids]));

  const { error: insertErr } = await supabase.from('composed_mock_papers').insert({
    exam,
    paper_key: paperKey,
    question_ids: questionIds,
    composition_plan: sectionPlans.map(p => ({ subject: p.subject, rationale: p.rationale })),
    model_used: modelUsed,
  });

  if (insertErr) console.error('Failed to cache composed paper:', insertErr.message);

  return json({ question_ids: questionIds, model_used: modelUsed, cached: false });
}));
