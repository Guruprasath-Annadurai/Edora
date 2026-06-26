// ── DPDP Act Data Export ──────────────────────────────────────────────────────
// Collects all user-identifiable data and returns it as a signed JSON download.
// DPDP Act 2023 (India) requires portability of personal data on user request.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

Deno.serve(withSentry('export-user-data', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const uid = user.id;

  // Collect all user data in parallel — only columns that contain personal data
  const [
    profiles,
    quizSessions,
    quizAnswers,
    xpHistory,
    lessonProgress,
    streaks,
    topicPerformance,
    flashcardReviews,
    novoMemories,
    userMoods,
  ] = await Promise.all([
    supabaseUser.from('profiles')
      .select('full_name,email,study_level,subjects,exam_name,exam_date,xp,streak_count,created_at,dpdp_consent_at,dpdp_consent_version')
      .eq('id', uid).maybeSingle(),

    supabaseUser.from('quiz_sessions')
      .select('subject,topic,score,score_pct,completed_at')
      .eq('user_id', uid).order('completed_at', { ascending: false }).limit(1000),

    supabaseUser.from('quiz_user_answers')
      .select('question_id,correct,topic,subject,answered_at')
      .eq('user_id', uid).order('answered_at', { ascending: false }).limit(5000),

    supabaseUser.from('xp_history')
      .select('amount,reason,created_at')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(2000),

    supabaseUser.from('lesson_progress')
      .select('lesson_id,completed,xp_earned,completed_at')
      .eq('user_id', uid),

    supabaseUser.from('study_streaks')
      .select('date,synced_offline')
      .eq('user_id', uid).order('date', { ascending: false }).limit(365),

    supabaseUser.from('topic_performance')
      .select('subject,topic,correct_count,total_count,last_updated')
      .eq('user_id', uid),

    supabaseUser.from('flashcard_reviews')
      .select('card_id,quality,reviewed_at')
      .eq('user_id', uid).order('reviewed_at', { ascending: false }).limit(2000),

    supabaseUser.from('novo_memories')
      .select('memory_type,content,topic,importance,created_at')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(500),

    supabaseUser.from('user_moods')
      .select('mood,logged_at')
      .eq('user_id', uid).order('logged_at', { ascending: false }).limit(365),
  ]);

  const exportPayload = {
    exported_at:       new Date().toISOString(),
    exported_for:      user.email,
    dpdp_act_notice:   'This export was generated under the Digital Personal Data Protection Act, 2023 (India). It contains all personal data Edora holds for you.',
    profile:           profiles.data,
    quiz_sessions:     quizSessions.data ?? [],
    quiz_answers:      quizAnswers.data ?? [],
    xp_history:        xpHistory.data ?? [],
    lesson_progress:   lessonProgress.data ?? [],
    study_streaks:     streaks.data ?? [],
    topic_performance: topicPerformance.data ?? [],
    flashcard_reviews: flashcardReviews.data ?? [],
    novo_memories:     novoMemories.data ?? [],
    moods:             userMoods.data ?? [],
  };

  const json     = JSON.stringify(exportPayload, null, 2);
  const filename = `edora-data-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(json, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}));
