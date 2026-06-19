// ─────────────────────────────────────────────────────────────────────────────
// Learning Style Profiler — Tier 2 Feature 8
//
// Analyses session behaviour to classify students as:
//   visual | conceptual | example_driven | step_by_step | mixed
//
// Signals are gathered from:
//   - tutoring session messages (what they ask, how they respond)
//   - checkpoint performance patterns
//   - quiz answer patterns
//
// Profile is updated incrementally after each session.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }   from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

export type LearningStyleType = 'visual' | 'conceptual' | 'example_driven' | 'step_by_step' | 'mixed';

export interface LearningStyleProfile {
  id:                  string;
  user_id:             string;
  primary_style:       LearningStyleType;
  visual_score:        number;
  conceptual_score:    number;
  example_score:       number;
  step_by_step_score:  number;
  sessions_analysed:   number;
  last_analysed_at:    string | null;
}

export interface StyleSignal {
  session_id:   string;
  question:     string;     // student message that indicates style
  context:      string;     // what kind of question (clarification, example request, etc.)
  timestamp:    string;
}

// ── Style descriptions ────────────────────────────────────────────────────────
export const STYLE_DESCRIPTIONS: Record<LearningStyleType, {
  label:       string;
  emoji:       string;
  description: string;
  strengths:   string[];
  tips:        string[];
}> = {
  visual: {
    label:       'Visual Learner',
    emoji:       '🎨',
    description: 'You learn best through diagrams, charts, spatial relationships, and seeing information laid out visually.',
    strengths:   ['Spatial reasoning', 'Pattern recognition', 'Mind-mapping'],
    tips:        [
      'Ask Novo to describe concepts with spatial analogies',
      'Draw concept maps while studying',
      'Use colour-coding in your notes',
    ],
  },
  conceptual: {
    label:       'Conceptual Thinker',
    emoji:       '💡',
    description: 'You thrive on understanding the "why" behind things — big-picture thinking, theories, and principles.',
    strengths:   ['Abstract reasoning', 'Connecting ideas', 'Theory understanding'],
    tips:        [
      'Always ask Novo "why does this work?"',
      'Study underlying principles before memorising formulas',
      'Use the Socratic mode for deeper understanding',
    ],
  },
  example_driven: {
    label:       'Example-Driven Learner',
    emoji:       '📝',
    description: 'You understand best through worked examples, analogies, and seeing concepts applied in practice.',
    strengths:   ['Problem-solving', 'Applied learning', 'Pattern transfer'],
    tips:        [
      'Ask Novo for worked examples before attempting questions',
      'Study solved problems before theory',
      'Create your own examples to test understanding',
    ],
  },
  step_by_step: {
    label:       'Methodical Learner',
    emoji:       '🔢',
    description: 'You prefer structured, sequential learning — clear steps, ordered explanations, and systematic approaches.',
    strengths:   ['Attention to detail', 'Procedural accuracy', 'Systematic thinking'],
    tips:        [
      'Ask Novo to break down concepts into numbered steps',
      'Complete prerequisites before advancing',
      'Use the Spaced Repetition cards for systematic review',
    ],
  },
  mixed: {
    label:       'Versatile Learner',
    emoji:       '⚡',
    description: 'You adapt your learning style to the material — using different approaches for different topics.',
    strengths:   ['Adaptability', 'Flexible thinking', 'Multi-modal processing'],
    tips:        [
      'Experiment with different explanation styles in Novo',
      'Mix note-taking methods based on the subject',
      'Use all of Novo\'s features for a well-rounded approach',
    ],
  },
};

// ── Load profile ──────────────────────────────────────────────────────────────
export async function loadLearningStyle(userId: string): Promise<LearningStyleProfile | null> {
  const { data } = await supabase
    .from('learning_style_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data as LearningStyleProfile | null;
}

// ── Analyse session signals via Gemini ────────────────────────────────────────
interface StyleScores {
  visual:        number;
  conceptual:    number;
  example_driven:number;
  step_by_step:  number;
}

async function analyseSessionStyle(signals: StyleSignal[]): Promise<StyleScores> {
  if (!signals.length) {
    return { visual: 0.25, conceptual: 0.25, example_driven: 0.25, step_by_step: 0.25 };
  }

  const signalText = signals.slice(0, 20).map(s =>
    `Student said: "${s.question}" (context: ${s.context})`
  ).join('\n');

  const prompt = `Analyse these student interactions from a tutoring session and determine their learning style preferences.

Student interactions:
${signalText}

Classify the student's learning style by scoring each dimension 0.0-1.0 (scores should sum to ~1.0):
- visual: prefers spatial/visual explanations, asks for diagrams or spatial analogies
- conceptual: wants to understand "why", asks about underlying principles, big-picture thinking
- example_driven: asks for examples, worked problems, analogies, real-world applications
- step_by_step: prefers sequential instructions, numbered steps, structured breakdowns

Return ONLY valid JSON:
{
  "visual": 0.2,
  "conceptual": 0.3,
  "example_driven": 0.35,
  "step_by_step": 0.15
}`;

  try {
    const scores = await geminiJSON<StyleScores>(prompt);
    // Normalise so they sum to 1
    const total = scores.visual + scores.conceptual + scores.example_driven + scores.step_by_step;
    if (total > 0) {
      scores.visual          /= total;
      scores.conceptual      /= total;
      scores.example_driven  /= total;
      scores.step_by_step    /= total;
    }
    return scores;
  } catch (_) {
    return { visual: 0.25, conceptual: 0.25, example_driven: 0.25, step_by_step: 0.25 };
  }
}

// ── Extract signals from a tutoring session ───────────────────────────────────
export async function extractSessionSignals(sessionId: string): Promise<StyleSignal[]> {
  const { data: messages } = await supabase
    .from('session_messages')
    .select('content, message_type, created_at')
    .eq('session_id', sessionId)
    .eq('message_type', 'user')
    .order('created_at', { ascending: true });

  return (messages ?? []).map((m: any) => ({
    session_id: sessionId,
    question:   m.content.slice(0, 200),
    context:    classifySignal(m.content),
    timestamp:  m.created_at,
  }));
}

function classifySignal(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('show') || t.includes('diagram') || t.includes('draw') || t.includes('picture') || t.includes('visuali'))
    return 'visual_request';
  if (t.includes('why') || t.includes('how does') || t.includes('principle') || t.includes('concept') || t.includes('understand'))
    return 'conceptual_question';
  if (t.includes('example') || t.includes('for instance') || t.includes('like') || t.includes('analogous') || t.includes('show me'))
    return 'example_request';
  if (t.includes('step') || t.includes('first') || t.includes('then') || t.includes('next') || t.includes('how to'))
    return 'procedure_request';
  return 'general';
}

// ── Update profile after a session ───────────────────────────────────────────
export async function updateStyleProfile(
  userId:    string,
  sessionId: string,
): Promise<LearningStyleProfile | null> {
  const signals = await extractSessionSignals(sessionId);
  if (!signals.length) return loadLearningStyle(userId);

  const newScores = await analyseSessionStyle(signals);

  // Load existing profile
  const existing = await loadLearningStyle(userId);

  let blended: StyleScores;
  let sessionsAnalysed = 1;

  if (existing) {
    // Exponential moving average — new data weighted 30%
    const alpha = 0.3;
    sessionsAnalysed = existing.sessions_analysed + 1;
    blended = {
      visual:         existing.visual_score        * (1 - alpha) + newScores.visual         * alpha,
      conceptual:     existing.conceptual_score    * (1 - alpha) + newScores.conceptual     * alpha,
      example_driven: existing.example_score       * (1 - alpha) + newScores.example_driven * alpha,
      step_by_step:   existing.step_by_step_score  * (1 - alpha) + newScores.step_by_step   * alpha,
    };
  } else {
    blended = newScores;
  }

  // Determine primary style
  const entries = Object.entries(blended) as [string, number][];
  const maxEntry = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const dominance = maxEntry[1];

  // "mixed" if no clear winner (max < 0.35)
  const primaryStyle: LearningStyleType = dominance >= 0.35
    ? (maxEntry[0].replace('_driven', '') as LearningStyleType)
    : 'mixed';

  // Map back to column names
  const correctPrimary: LearningStyleType =
    maxEntry[0] === 'example_driven' ? 'example_driven' :
    maxEntry[0] === 'step_by_step'   ? 'step_by_step'   :
    maxEntry[0] as LearningStyleType;

  const upsertData = {
    user_id:             userId,
    primary_style:       dominance >= 0.35 ? correctPrimary : 'mixed',
    visual_score:        blended.visual,
    conceptual_score:    blended.conceptual,
    example_score:       blended.example_driven,
    step_by_step_score:  blended.step_by_step,
    sessions_analysed:   sessionsAnalysed,
    last_analysed_at:    new Date().toISOString(),
  };

  const { data } = await supabase
    .from('learning_style_profiles')
    .upsert(upsertData, { onConflict: 'user_id' })
    .select()
    .single();

  return data as LearningStyleProfile | null;
}

// ── Get tutoring style instruction for Gemini prompt ─────────────────────────
export function styleInstruction(style: LearningStyleType): string {
  switch (style) {
    case 'visual':
      return 'Use spatial descriptions, analogies with shapes and positions, and vivid imagery. Describe concepts as if drawing them.';
    case 'conceptual':
      return 'Lead with the underlying "why" and first principles. Connect to bigger ideas before details. Use theoretical frameworks.';
    case 'example_driven':
      return 'Always provide worked examples first. Use real-world analogies. Show before telling. Provide 2-3 examples per concept.';
    case 'step_by_step':
      return 'Break everything into numbered sequential steps. Be methodical. Never skip steps. Confirm each step before moving on.';
    case 'mixed':
    default:
      return 'Adapt your explanation style to what works best for this specific concept — use examples, analogies, and structure as needed.';
  }
}
