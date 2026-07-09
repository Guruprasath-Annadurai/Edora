export type TutoringMode = 'standard' | 'socratic' | 'drill';
export type StudyLevel   = 'school' | 'college' | 'competitive' | 'professional';
export type PagePhase    = 'setup' | 'starting' | 'session' | 'complete';
export type SessionPhase = 'teaching' | 'checkpoint' | 'complete';

export interface CheckpointOption {
  label: string;
  text: string;
}

export interface CheckpointQuestion {
  question: string;
  options: CheckpointOption[];
  difficulty?: string;
  level?: number;
}

export interface ConceptStatus {
  title: string;
  status: 'pending' | 'in_progress' | 'mastered' | 'partial';
}

export interface SessionState {
  phase: SessionPhase;
  concepts_done: number;
  total_concepts: number;
  score: number;
  total_checkpoints: number;
  show_checkpoint_prompt: boolean;
  xp_earned?: number;
  completed_concepts?: ConceptStatus[];
}

export type MessageType =
  | 'text'
  | 'objective'
  | 'checkpoint_question'
  | 'checkpoint_answer'
  | 'feedback'
  | 'transition'
  | 'complete';

export interface TutoringMessage {
  id: string;
  role: 'novo' | 'student';
  type: MessageType;
  content: string;
  // checkpoint_question
  checkpointData?: CheckpointQuestion;
  // checkpoint_answer
  isCorrect?: boolean;
  // objective
  objectives?: string[];
  // transition
  conceptTitle?: string;
  // complete
  xpEarned?: number;
}
