export type NovoPersonality = 'dominie' | 'preceptor' | 'teacher' | 'friend' | 'coach' | 'examiner' | 'mentor';
export type ExplanationStyle = 'simple' | 'balanced' | 'deep' | 'socratic';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  study_level: 'school' | 'college' | 'jee_neet' | 'sat_act';
  xp: number;
  level: number;
  streak_count: number;
  streak_freeze_count: number;
  preferred_language: string;
  exam_name: string | null;
  exam_date: string | null;   // ISO date string yyyy-mm-dd
  novo_personality: NovoPersonality;
  // Tier 7 — Pro subscription
  is_pro: boolean;
  pro_expires_at: string | null;
  // Tier 3 B2B — Teacher & School
  is_teacher: boolean;
  school_id: string | null;
  // Novo Memory v2
  explanation_style: ExplanationStyle;
  created_at: string;
  // Social & Competitive — leaderboard scopes
  state_name?: string | null;
  city_name?: string | null;
  school_name?: string | null;
  // Network Effects — friends, study buddy
  username?: string | null;
  last_active?: string | null;
  // DPDP Act 2023 consent tracking
  dpdp_consent_at?: string | null;
  dpdp_consent_version?: string | null;
  // Referral program
  referral_code?: string | null;
}

export interface Achievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: 'teacher' | 'friend';
  created_at: string;
}

export interface Flashcard {
  id: string;
  user_id: string;
  front: string;
  back: string;
  subject: string;
  topic: string;
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review: string;
  created_at: string;
  updated_at: string;
}

export interface QuizSession {
  id: string;
  user_id: string;
  subject: string;
  topic: string;
  questions: QuizQuestion[];
  score: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  user_answer?: number;
}

export interface SprintSession {
  id: string;
  user_id: string;
  mode: 'solo' | 'group';
  subject: string;
  topic: string;
  duration: number;
  completed: boolean;
  xp_earned: number;
  created_at: string;
}

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  type: 'sprint' | 'flashcard' | 'quiz' | 'chat';
  completed: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  display_name: string;
  xp: number;
  level: number;
  streak: number;
  is_current_user: boolean;
}

export interface StudyNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  subject: string;
  ocr_text: string | null;
  image_url: string | null;
  created_at: string;
}

// ── Tier 6: Independent AI Tutor Identity ────────────────────────────────────

export type MemoryType = 'struggle' | 'strength' | 'preference' | 'milestone' | 'pattern' | 'exam_context';
export type MemorySource = 'chat' | 'sprint' | 'quiz' | 'tutoring' | 'debate' | 'system';

export interface NovoMemory {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  content: string;
  subject: string | null;
  topic: string | null;
  importance: number;
  source: MemorySource | null;
  created_at: string;
  expires_at: string | null;
}

export interface NovoSessionSummary {
  id?: string;
  user_id?: string;
  source: 'chat' | 'quiz' | 'tutoring' | 'sprint';
  subject: string | null;
  topic: string | null;
  summary: string;
  struggles: string[] | null;
  wins: string[] | null;
  duration_mins: number | null;
  created_at: string;
}

export interface NovoMemoryContext {
  top_weaknesses:    Pick<NovoMemory, 'id' | 'content' | 'subject' | 'topic' | 'importance'>[];
  recent_strengths:  Pick<NovoMemory, 'id' | 'content' | 'subject' | 'topic' | 'importance'>[];
  session_summaries: Pick<NovoSessionSummary, 'summary' | 'subject' | 'topic' | 'struggles' | 'wins' | 'source' | 'created_at'>[];
  preferences:       Pick<NovoMemory, 'content'>[];
  explanation_style: ExplanationStyle;
  exam_context:      { name: string; date: string | null } | null;
  system_prompt_block: string;
  /** Per-topic win/struggle counts returned by the novo-memory edge function */
  topic_stats?: Array<{ topic: string; struggle_count: number; win_count: number }>;
}

export type LessonTaskType = 'study' | 'practice' | 'review' | 'quiz' | 'milestone_quiz';

export interface LessonTask {
  index: number;
  type: LessonTaskType;
  title: string;
  topic: string | null;
  duration_min: number;
  description: string;
}

export interface LessonDay {
  day: number;           // 0=Mon … 6=Sun
  day_name: string;
  theme: string;
  tasks: LessonTask[];
  is_milestone_day: boolean;
  milestone_topics?: string[];
}

export interface LessonPlanData {
  subject: string;
  week_start: string;
  goal: string;
  total_hours: number;
  exam_aligned: boolean;
  days: LessonDay[];
}

export interface LessonPlan {
  id: string;
  user_id: string;
  subject: string;
  week_start: string;
  goal: string | null;
  plan_data: LessonPlanData;
  status: 'active' | 'completed' | 'archived';
  total_tasks: number;
  done_tasks: number;
  created_at: string;
}

export interface LessonPlanTask {
  id: string;
  plan_id: string;
  day_index: number;
  task_index: number;
  title: string;
  task_type: LessonTaskType;
  topic: string | null;
  duration_min: number | null;
  description: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface NovoCertification {
  id: string;
  user_id: string;
  subject: string;
  topic: string;
  student_name: string;
  score: number;
  questions_total: number;
  pct_score: number;
  share_code: string;
  issued_at: string;
}

export interface AssessmentQuestion {
  q: string;
  options: [string, string, string, string];
  correct_idx: number;
  explanation: string;
}

export interface CertificationAssessment {
  id: string;
  user_id: string;
  subject: string;
  topic: string;
  questions: AssessmentQuestion[];
  answers: number[];
  current_q: number;
  status: 'in_progress' | 'passed' | 'failed';
  score: number | null;
  pct_score: number | null;
  cert_id: string | null;
  started_at: string;
  completed_at: string | null;
}

// ── Tier 7: Engagement, Social & Monetization ────────────────────────────────

export interface StudyGroup {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  avatar_emoji: string;
  is_public: boolean;
  created_at: string;
}

export interface StudyGroupMember {
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  // Joined from profiles:
  full_name?: string | null;
  xp?: number;
  streak_count?: number;
  weekly_xp?: number;
}

export interface GroupLeaderboardEntry {
  user_id: string;
  full_name: string | null;
  xp: number;
  weekly_xp: number;
  streak_count: number;
  rank: number;
  is_current_user: boolean;
}

export interface AnalyticsStats {
  subject_accuracy: { subject: string; accuracy: number; total: number }[];
  weak_topics: { topic: string; subject: string; accuracy: number; count: number }[];
  xp_by_day: { date: string; xp: number }[];
  study_time_by_subject: { subject: string; minutes: number }[];
  predicted_score: number | null;
  total_sessions_30d: number;
  avg_accuracy_30d: number;
  best_subject: string | null;
  worst_subject: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'monthly' | 'annual';
  status: 'active' | 'cancelled' | 'expired';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  amount_paise: number;
  currency: string;
  starts_at: string;
  expires_at: string;
  created_at: string;
}

export type ProactiveMessageType =
  | 'diagnostic' | 'exam_reminder' | 'streak_check' | 'milestone'
  | 'lesson_nudge' | 'memory_callback' | 'welcome_back' | 'goal_check'
  | 'encouragement' | 'comeback' | 'revision_mode';

export interface NovoProactiveMessage {
  id: string;
  user_id: string;
  message: string;
  message_type: ProactiveMessageType;
  cta_label: string | null;
  cta_route: string | null;
  context_data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}
