import { supabase } from '@/lib/supabase';

// Matches the `report_type` CHECK constraint on public.question_reports
// (supabase/migrations/20260728_production_systems.sql).
export type ReportType = 'wrong_answer' | 'ambiguous' | 'outdated' | 'inappropriate' | 'other';

export interface ReportContentParams {
  userId: string;
  /** The AI-generated content being reported, verbatim — stored for audit trail. */
  contentText: string;
  reportType: ReportType;
  /** Which surface this came from, e.g. 'chat', 'photo_solver', 'flashcard' — prefixed onto details. */
  source: string;
  /** Extra context: chapter/topic/model used/etc. */
  details?: string;
  /** DB id of the content if it has one (e.g. an ai_questions row). */
  contentId?: string;
}

/**
 * Single write path into the question_reports review queue. Every AI surface
 * that lets a student flag bad content should go through this — previously
 * each page reimplemented its own insert (or, in ChatPage's case, only fired
 * an analytics event and never actually wrote a report).
 */
export async function reportContent(params: ReportContentParams): Promise<{ error: Error | null }> {
  const { userId, contentText, reportType, source, details, contentId } = params;
  const { error } = await supabase.from('question_reports').insert({
    user_id: userId,
    question_id: contentId ?? null,
    question_text: contentText.slice(0, 4000),
    report_type: reportType,
    details: `[${source}]${details ? ' ' + details : ''}`,
    status: 'pending',
  });
  return { error: error ? new Error(error.message) : null };
}
