// ─────────────────────────────────────────────────────────────────────────────
// story-mode — concepts delivered inside an adventure narrative
// Actions: get_scenarios | create_session | continue_story | complete | list_sessions
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSON<T>(prompt: string): Promise<T> {
  const raw = await gemini(prompt + '\n\nReturn valid JSON only. No markdown fences.');
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : raw) as T;
}

// ── Scenario library ──────────────────────────────────────────────────────────
interface Scenario {
  id:          string;
  title:       string;
  hook:        string;  // opening sentence
  description: string;
  topic:       string;
  emoji:       string;
  xp_max:      number;
}

const SCENARIO_BANK: Record<string, Scenario[]> = {
  Mathematics: [
    { id: 'archaeologist_base12', title: 'The Lost Civilisation', hook: 'You are an archaeologist. You found an ancient inscription in Base 12. Decode it.', description: 'Discover an ancient numerical system and decode messages from a lost civilisation.', topic: 'Number Bases', emoji: '🏺', xp_max: 200 },
    { id: 'cryptographer_primes', title: 'The Encrypted Message', hook: 'A cryptic message has arrived. Only someone who understands prime numbers can break the code.', description: 'Use prime factorisation and modular arithmetic to crack a spy cipher.', topic: 'Prime Numbers & Cryptography', emoji: '🔐', xp_max: 200 },
    { id: 'space_navigator', title: 'Navigate the Stars', hook: 'Your spacecraft is lost. You must use vectors and trigonometry to chart a course home.', description: 'Apply vectors, angles, and trigonometry to navigate through space.', topic: 'Vectors & Trigonometry', emoji: '🚀', xp_max: 250 },
    { id: 'architect_bridges', title: 'Build the Bridge', hook: 'You are the chief engineer. The bridge must hold 10 tonnes. Only calculus will save you.', description: 'Use differentiation and optimisation to design a structurally sound bridge.', topic: 'Calculus & Optimisation', emoji: '🌉', xp_max: 250 },
  ],
  Physics: [
    { id: 'time_traveller_relativity', title: 'The Time Traveller\'s Dilemma', hook: 'You\'ve been sent back in time, but your return velocity must obey special relativity or you\'ll age by decades.', description: 'Understand time dilation and relativistic mechanics through a time-travel adventure.', topic: 'Special Relativity', emoji: '⏰', xp_max: 300 },
    { id: 'earthquake_waves', title: 'The Seismologist', hook: 'A major earthquake struck 200km away. You have 3 seismograph readings. Find the epicentre.', description: 'Use wave physics and triangulation to locate an earthquake epicentre.', topic: 'Wave Physics', emoji: '🌍', xp_max: 200 },
    { id: 'roller_coaster', title: 'Thrill Ride Designer', hook: 'You must design the world\'s safest roller coaster. Physics is the only tool you have.', description: 'Apply energy conservation, circular motion, and G-forces to design a roller coaster.', topic: 'Mechanics & Energy', emoji: '🎢', xp_max: 200 },
  ],
  Chemistry: [
    { id: 'detective_poison', title: 'The Poisoned Garden', hook: 'A nobleman has been poisoned. Only chemical analysis can reveal the culprit substance.', description: 'Use acid-base chemistry and qualitative analysis to identify a mysterious poison.', topic: 'Acids, Bases & Analysis', emoji: '🧪', xp_max: 200 },
    { id: 'pharmacist_drugs', title: 'The Emergency Synthesis', hook: 'A hospital has run out of a critical drug. You are the only chemist who can synthesise it in time. Organic chemistry is your tool.', description: 'Navigate organic reaction pathways to synthesise a life-saving pharmaceutical compound under time pressure.', topic: 'Organic Chemistry', emoji: '⚗️', xp_max: 300 },
  ],
  Biology: [
    { id: 'virologist_outbreak', title: 'The Viral Outbreak', hook: 'A new virus has emerged. You are patient zero\'s doctor. Understanding immunology is your only hope.', description: 'Trace how an immune response combats a novel virus through a medical thriller.', topic: 'Immunology', emoji: '🦠', xp_max: 250 },
    { id: 'geneticist_inheritance', title: 'The Family Secret', hook: 'A family hires you to explain why their child has a condition no parent shows. Genetics holds the answer.', description: 'Use Mendelian genetics and pedigree analysis to solve a hereditary mystery.', topic: 'Genetics & Inheritance', emoji: '🧬', xp_max: 200 },
  ],
  History: [
    { id: 'spy_ww2', title: 'The Double Agent', hook: 'It is 1943. You are a spy in occupied Paris. Decisions you make tonight will affect the course of the war.', description: 'Navigate World War II events and understand their causes and consequences through a spy thriller.', topic: 'World War II', emoji: '🕵️', xp_max: 200 },
    { id: 'roman_senator', title: 'Counsel of Rome', hook: 'You are a Roman Senator in 44 BC. Julius Caesar approaches the steps of the Theatre of Pompey.', description: 'Experience the fall of the Roman Republic through first-person decision-making.', topic: 'Ancient Rome', emoji: '🏛️', xp_max: 200 },
  ],
  English: [
    { id: 'editor_gatsby', title: 'The Manuscript', hook: 'You are F. Scott Fitzgerald\'s editor. He has sent you 30 pages. Your job: find the deeper meaning.', description: 'Analyse literary techniques, symbolism, and themes in classic literature through an editorial role.', topic: 'Literary Analysis', emoji: '📝', xp_max: 200 },
    { id: 'journalist_1984', title: 'Ministry of Truth', hook: 'You work for the Ministry of Truth. Something is wrong with the language. Resist it.', description: 'Explore dystopian literature, propaganda, and language through an immersive role-play.', topic: 'Dystopian Literature', emoji: '📖', xp_max: 250 },
  ],
};

serve(withSentry('story-mode', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  const rl = await checkRateLimit(supabase, user.id, `story_mode_${action}`, 25, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  // ── get_scenarios ─────────────────────────────────────────────────────────
  if (action === 'get_scenarios') {
    const { subject } = body;
    const scenarios = SCENARIO_BANK[subject] ?? Object.values(SCENARIO_BANK).flat();
    return json({ scenarios });
  }

  // ── create_session ────────────────────────────────────────────────────────
  if (action === 'create_session') {
    const { scenario_id, subject } = body;

    // Find scenario
    const allScenarios = Object.values(SCENARIO_BANK).flat();
    const scenario = allScenarios.find(s => s.id === scenario_id);
    if (!scenario) return json({ error: 'Scenario not found' }, 404);

    // Generate the opening scene
    const opening = await gemini(`
You are Novo, an AI tutor delivering a concept through immersive storytelling.

Scenario: ${scenario.title}
Topic being taught: ${scenario.topic}
Subject: ${subject || scenario.id.split('_')[0]}
Opening hook: "${scenario.hook}"

Write the opening scene of this story. You are a narrator/guide.
- 3-4 vivid paragraphs setting the scene
- Naturally weave in the first concept related to "${scenario.topic}"
- End with a question or challenge that requires the student to engage with the concept
- Make it feel like a real adventure, not a textbook
- Do NOT say "let me teach you about X" — show, don't tell
- Start with the hook: "${scenario.hook}"`);

    const messages = [
      { role: 'narrator', content: opening, timestamp: new Date().toISOString() }
    ];

    const { data: session } = await supabase
      .from('story_sessions')
      .insert({
        user_id: user.id,
        subject: subject || 'General',
        topic: scenario.topic,
        scenario_id,
        scenario_title: scenario.title,
        scenario_hook: scenario.hook,
        messages,
        concepts_covered: [],
      })
      .select('*')
      .single();

    return json({ session });
  }

  // ── continue_story ────────────────────────────────────────────────────────
  if (action === 'continue_story') {
    const { session_id, message } = body;

    const { data: session } = await supabase
      .from('story_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();
    if (!session) return json({ error: 'Session not found' }, 404);
    if (session.status !== 'active') return json({ error: 'Story already completed' }, 400);

    const messages = session.messages as Array<{ role: string; content: string }>;
    messages.push({ role: 'student', content: message, timestamp: new Date().toISOString() } as any);

    const turnCount = messages.filter(m => m.role === 'student').length;
    const isCheckpoint = turnCount % 3 === 0; // Every 3 student turns, insert a concept checkpoint
    const isNearEnd = turnCount >= 6;

    const historyText = messages.slice(-8).map(m =>
      `${m.role === 'narrator' ? 'NARRATOR' : 'YOU'}: ${m.content}`
    ).join('\n\n');

    const narratorResponse = await gemini(`
You are Novo, the narrator of an educational adventure story.

Story: ${session.scenario_title}
Topic being taught: ${session.topic}
Student is at turn ${turnCount}

Recent conversation:
${historyText}

Continue the story based on the student's response.
${isCheckpoint ? `
CHECKPOINT MOMENT: The student has been in the story for ${turnCount} turns.
- Explicitly test their understanding of a specific aspect of "${session.topic}"
- Pose a clear academic question within the story context
- Make it feel natural — perhaps a puzzle, a character needing help, a crisis requiring knowledge
` : ''}
${isNearEnd ? `
STORY CLIMAX: We are approaching the end. Start building toward a satisfying conclusion.
- Reference the concepts they've learned throughout
- Create one final meaningful challenge
` : ''}

Rules:
- Stay fully in the story world — never break character by saying "now let's learn..."
- Weave ${session.topic} concepts naturally into narrative events
- React to what the student said — good answers advance the plot positively, wrong answers create complications
- Keep each response to 2-4 paragraphs
- End with either an action prompt or a direct question`);

    messages.push({ role: 'narrator', content: narratorResponse, timestamp: new Date().toISOString() } as any);

    // Extract any concepts covered (simple check)
    const concepts_covered = session.concepts_covered as string[];
    if (isCheckpoint) {
      interface ConceptExtract { concept: string; }
      const extract = await geminiJSON<ConceptExtract>(`
From this educational story exchange, what single specific concept from "${session.topic}" was just demonstrated or tested?
Return JSON: {"concept": "specific concept name (5 words max)"}`).catch(() => null);
      if (extract?.concept && !concepts_covered.includes(extract.concept)) {
        concepts_covered.push(extract.concept);
      }
    }

    const status = isNearEnd && turnCount >= 8 ? 'completed' : 'active';
    const xp_earned = status === 'completed' ? session.xp_earned + 50 : session.xp_earned + (isCheckpoint ? 20 : 0);
    const checkpoints_passed = session.checkpoints_passed + (isCheckpoint ? 1 : 0);

    await supabase
      .from('story_sessions')
      .update({
        messages,
        concepts_covered,
        status,
        xp_earned,
        checkpoints_passed,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', session_id);

    // Award XP if completed
    if (status === 'completed') {
      await supabase.rpc('increment_xp', { user_id: user.id, amount: xp_earned });
    } else if (isCheckpoint && xp_earned > session.xp_earned) {
      await supabase.rpc('increment_xp', { user_id: user.id, amount: 20 });
    }

    return json({ reply: narratorResponse, is_checkpoint: isCheckpoint, status, xp_earned, concepts_covered });
  }

  // ── complete ──────────────────────────────────────────────────────────────
  if (action === 'complete') {
    const { session_id } = body;
    const { data: session } = await supabase
      .from('story_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();
    if (!session) return json({ error: 'Not found' }, 404);

    const total_xp = (session.xp_earned || 0) + 50; // completion bonus
    await supabase.rpc('increment_xp', { user_id: user.id, amount: 50 });
    await supabase
      .from('story_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), xp_earned: total_xp })
      .eq('id', session_id);

    return json({ xp_earned: total_xp, concepts_covered: session.concepts_covered });
  }

  // ── list_sessions ─────────────────────────────────────────────────────────
  if (action === 'list_sessions') {
    const { data: sessions } = await supabase
      .from('story_sessions')
      .select('id,subject,topic,scenario_title,scenario_hook,status,xp_earned,checkpoints_passed,concepts_covered,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    return json({ sessions: sessions ?? [] });
  }

  // ── get_session ───────────────────────────────────────────────────────────
  if (action === 'get_session') {
    const { session_id } = body;
    const { data: session } = await supabase
      .from('story_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();
    return json({ session });
  }

  return json({ error: 'Unknown action' }, 400);
}));
