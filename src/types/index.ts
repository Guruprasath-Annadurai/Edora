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
  created_at: string;
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
