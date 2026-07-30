import type { CreateAssignmentInput } from '@/hooks/useTeacher';

export const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'English', 'Computer Science',
  'Economics', 'Hindi', 'Civics', 'Science',
];

export const CLASS_NUMS = [6, 7, 8, 9, 10, 11, 12];

export function scoreColor(score: number | null, isLight = false) {
  if (score === null) return isLight ? '#52525B' : '#6B7280';
  if (score >= 80) return isLight ? '#047857' : '#10B981';
  if (score >= 60) return isLight ? '#92400E' : '#F59E0B';
  return isLight ? '#B91C1C' : '#EF4444';
}

export function gradeLetter(score: number | null) {
  if (score === null) return '—';
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export type { CreateAssignmentInput };
