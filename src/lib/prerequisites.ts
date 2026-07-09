// ─────────────────────────────────────────────────────────────────────────────
// Prerequisite Detector — Tier 2 Feature 7
//
// Analyses what the student knows vs what a topic requires,
// surfaces gaps, and integrates with the Tutoring Session to
// warn before starting an advanced topic.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }       from '@/lib/supabase';
import { geminiJSON }     from '@/lib/gemini';
import { loadSubjectMastery } from '@/lib/adaptiveDifficulty';

export interface SubjectDependency {
  id:          string;
  subject:     string;
  requires:    string;
  strength:    'required' | 'recommended' | 'helpful';
  description: string | null;
}

export interface PrerequisiteGap {
  subject:      string;
  mastery:      number;       // 0-1
  strength:     'required' | 'recommended' | 'helpful';
  description:  string | null;
}

export interface PrerequisiteReport {
  target_subject:  string;
  gaps:            PrerequisiteGap[];
  is_ready:        boolean;   // no 'required' gaps below threshold
  readiness_score: number;    // 0-1 weighted
  advice:          string;
}

const MASTERY_THRESHOLD = 0.4;   // must be above this to be "met"

// ── Load all subject dependencies from DB ─────────────────────────────────────
export async function loadSubjectDependencies(): Promise<SubjectDependency[]> {
  const { data } = await supabase
    .from('subject_dependencies')
    .select('*')
    .order('subject');
  return (data ?? []) as SubjectDependency[];
}

// ── Check prerequisites for a given subject ───────────────────────────────────
export async function checkPrerequisites(
  userId:        string,
  targetSubject: string,
): Promise<PrerequisiteReport> {
  // Load dependencies for this subject
  const { data: deps } = await supabase
    .from('subject_dependencies')
    .select('*')
    .eq('subject', targetSubject);

  const dependencies = (deps ?? []) as SubjectDependency[];

  if (!dependencies.length) {
    return {
      target_subject:  targetSubject,
      gaps:            [],
      is_ready:        true,
      readiness_score: 1,
      advice:          `No specific prerequisites required for ${targetSubject}. You're ready to start!`,
    };
  }

  // Load user's mastery for each prerequisite subject
  const gaps: PrerequisiteGap[] = [];
  let totalWeight = 0;
  let metWeight   = 0;

  for (const dep of dependencies) {
    const weight = dep.strength === 'required' ? 3 : dep.strength === 'recommended' ? 2 : 1;
    totalWeight += weight;

    // Get mastery across all subtopics for the required subject
    const masteryData = await loadSubjectMastery(userId, dep.requires);
    const avgMastery  = masteryData.length > 0
      ? masteryData.reduce((s, m) => s + m.mastery_score, 0) / masteryData.length
      : 0;

    if (avgMastery >= MASTERY_THRESHOLD) {
      metWeight += weight;
    } else {
      gaps.push({
        subject:     dep.requires,
        mastery:     avgMastery,
        strength:    dep.strength as PrerequisiteGap['strength'],
        description: dep.description,
      });
    }
  }

  const readinessScore = totalWeight > 0 ? metWeight / totalWeight : 1;
  const requiredGaps   = gaps.filter(g => g.strength === 'required');
  const isReady        = requiredGaps.length === 0;

  // Generate advice via Gemini if there are gaps
  let advice: string;
  if (!gaps.length) {
    advice = `Your prerequisite knowledge looks solid for ${targetSubject}. Go ahead!`;
  } else if (!isReady) {
    const gapList = requiredGaps.map(g =>
      `${g.subject} (you have ${Math.round(g.mastery * 100)}% mastery — need ${Math.round(MASTERY_THRESHOLD * 100)}%)`
    ).join(', ');
    advice = `Before diving into ${targetSubject}, it's strongly recommended to strengthen: ${gapList}. Use Novo to study these first.`;
  } else {
    const recGaps = gaps.filter(g => g.strength !== 'required');
    const gapList = recGaps.map(g => `${g.subject}`).join(', ');
    advice = `You're ready for ${targetSubject}! Strengthening ${gapList} would make things easier, but it's not blocking.`;
  }

  return {
    target_subject:  targetSubject,
    gaps,
    is_ready:        isReady,
    readiness_score: readinessScore,
    advice,
  };
}

// ── Detect topic-level prerequisites within a curriculum ──────────────────────
export interface TopicPrerequisiteStatus {
  topic_id:     string;
  is_unlocked:  boolean;
  missing:      string[];   // titles of required topics not yet complete
}

export async function checkTopicPrerequisites(
  userId:  string,
  topicId: string,
): Promise<TopicPrerequisiteStatus> {
  // Get prerequisites for this topic
  const { data: prereqs } = await supabase
    .from('curriculum_prerequisites')
    .select('required_topic_id, curriculum_topics!curriculum_prerequisites_required_topic_id_fkey(title)')
    .eq('topic_id', topicId);

  if (!prereqs?.length) {
    return { topic_id: topicId, is_unlocked: true, missing: [] };
  }

  type PrereqRow    = { required_topic_id: string; curriculum_topics: { title: string } | null };
  type ProgressRow  = { topic_id: string; status: string };

  const typedPrereqs = prereqs as unknown as PrereqRow[];
  const requiredIds  = typedPrereqs.map(p => p.required_topic_id);

  // Check user's progress on those topics
  const { data: progress } = await supabase
    .from('user_topic_progress')
    .select('topic_id, status')
    .eq('user_id', userId)
    .in('topic_id', requiredIds);

  const completedIds = new Set((progress ?? [] as ProgressRow[])
    .filter((p: ProgressRow) => p.status === 'complete')
    .map((p: ProgressRow) => p.topic_id));

  const missing = typedPrereqs
    .filter(p => !completedIds.has(p.required_topic_id))
    .map(p => p.curriculum_topics?.title ?? 'Unknown topic');

  return {
    topic_id:    topicId,
    is_unlocked: missing.length === 0,
    missing,
  };
}

// ── AI-powered prerequisite gap analysis ─────────────────────────────────────
export interface AIGapAnalysis {
  confidence:    number;   // 0-1 — how confident the AI is in the analysis
  key_gaps:      string[];
  study_order:   string[];
  estimated_days:number;
  tips:          string[];
}

export async function analyseGapsWithAI(
  userId:          string,
  targetSubject:   string,
  report:          PrerequisiteReport,
): Promise<AIGapAnalysis> {
  if (!report.gaps.length) {
    return {
      confidence:     1,
      key_gaps:       [],
      study_order:    [],
      estimated_days: 0,
      tips:           ['Your prerequisite knowledge is solid. Dive straight into ' + targetSubject + '!'],
    };
  }

  const gapSummary = report.gaps.map(g =>
    `${g.subject}: ${Math.round(g.mastery * 100)}% mastery (${g.strength} prerequisite)`
  ).join('\n');

  const prompt = `A student wants to study "${targetSubject}" but has these prerequisite gaps:
${gapSummary}

As an expert tutor, provide a concise study plan to fill these gaps.

Return ONLY valid JSON:
{
  "confidence": 0.9,
  "key_gaps": ["most important gap 1", "gap 2"],
  "study_order": ["subject to study first", "subject to study second"],
  "estimated_days": 14,
  "tips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"]
}`;

  try {
    return await geminiJSON<AIGapAnalysis>(prompt);
  } catch {
    return {
      confidence:     0.7,
      key_gaps:       report.gaps.map(g => g.subject),
      study_order:    report.gaps.filter(g => g.strength === 'required').map(g => g.subject),
      estimated_days: report.gaps.length * 7,
      tips:           ['Use Novo Tutoring to study each prerequisite topic systematically.'],
    };
  }
}
