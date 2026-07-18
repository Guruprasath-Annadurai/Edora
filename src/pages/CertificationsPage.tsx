import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award, ChevronLeft, Sparkles, CheckCircle2, XCircle, ChevronRight,
  Share2, BookOpen, Trophy, RotateCcw, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Capacitor } from '@capacitor/core';

// Defensive dynamic import — @capacitor/share is only available on native platforms.
// On web, we fall back to navigator.clipboard / navigator.share.
async function nativeShare(title: string, text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, dialogTitle: title });
  } else if (navigator.share) {
    await navigator.share({ title, text });
  } else {
    await navigator.clipboard.writeText(text);
    // No toast available here without Capacitor; caller should handle UX.
    throw new Error('copied');
  }
}
import type {NovoCertification, CertificationAssessment} from '@/types';
import { maybePromptRating } from '@/lib/appRating';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'English', 'Economics',
  'Computer Science', 'Sociology', 'Psychology',
];

const PASS_THRESHOLD = 80;

// ── Helper ────────────────────────────────────────────────────────────────────

function callFn(supabaseClient: typeof supabase, body: Record<string, unknown>) {
  return supabaseClient.auth.getSession().then(({ data: { session } }) =>
    supabaseClient.functions.invoke('novo-certifications', {
      body,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} })
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Certificate card ──────────────────────────────────────────────────────────

function CertCard({ cert, onSelect }: { cert: NovoCertification; onSelect: (c: NovoCertification) => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(cert)}
      className="w-full text-left"
      layout>
      <div className="rounded-3xl overflow-hidden"
        style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
        {/* Certificate header */}
        <div className="px-5 pt-5 pb-4"
          style={{ background: 'rgba(91,106,245,0.08)' }}>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Award size={24} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-white text-base leading-tight">{cert.topic}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{cert.subject}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold text-2xl" style={{ color: cert.pct_score >= 90 ? '#34D399' : '#8B9BFA' }}>
                {cert.pct_score}%
              </p>
              <p className="text-xs text-muted-foreground">{cert.score}/{cert.questions_total}</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--ink-060)' }}>
          <p className="text-xs text-muted-foreground">Issued {formatDate(cert.issued_at)}</p>
          <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#8B9BFA' }}>
            View <ChevronRight size={12} />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ── Certificate detail view ───────────────────────────────────────────────────

function CertDetail({ cert, onBack }: { cert: NovoCertification; onBack: () => void }) {
  async function share() {
    const text = `I just earned a Novo Certification in "${cert.topic}" (${cert.subject}) with a score of ${cert.pct_score}%.\n\nVerification code: ${cert.share_code.toUpperCase()}\n\nStudied with Edora AI.`;
    try {
      await nativeShare('Novo Certification', text);
    } catch (e) {
      // 'copied' means clipboard fallback was used — show a subtle UI hint
      if (e instanceof Error && e.message === 'copied') {
        // Use Capacitor Toast if available, otherwise silent (clipboard is fine)
        if (Capacitor.isNativePlatform()) {
          const { Toast } = await import('@capacitor/toast');
          await Toast.show({ text: 'Certificate details copied!', duration: 'short', position: 'bottom' });
        }
      }
      // Other errors (user cancelled share sheet) — silently ignore
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
      className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <button aria-label="Go back" onClick={onBack} className="text-white"><ChevronLeft size={20} /></button>
        <p className="font-heading font-bold text-white flex-1">Certificate</p>
        <button onClick={share} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
          style={{ color: '#8B9BFA', background: 'rgba(91,106,245,0.15)' }}>
          <Share2 size={13} /> Share
        </button>
      </div>

      <div className="flex-1 native-scroll pb-nav px-5 py-6 flex flex-col gap-6">
        {/* The certificate itself */}
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}
          className="rounded-3xl overflow-hidden border-2 shadow-2xl"
          style={{ borderColor: '#8B5CF6' }}>
          <div className="px-6 pt-8 pb-6 text-center"
            style={{ background: 'linear-gradient(180deg, rgba(91,106,245,0.15) 0%, var(--hdr-b-900) 100%)' }}>
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Award size={32} className="text-white" />
            </div>
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-1">
              Certificate of Mastery
            </p>
            <p className="font-heading text-2xl font-bold text-white mt-3 leading-tight">
              {cert.topic}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{cert.subject}</p>

            <div className="mt-5 py-4" style={{ borderTop: '1px solid var(--ink-080)', borderBottom: '1px solid var(--ink-080)' }}>
              <p className="text-xs text-muted-foreground">This certifies that</p>
              <p className="font-heading text-xl font-bold text-white mt-1">{cert.student_name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                has demonstrated mastery with a score of
              </p>
              <p className="font-bold text-4xl mt-2" style={{ color: cert.pct_score >= 90 ? '#34D399' : '#8B9BFA' }}>
                {cert.pct_score}%
              </p>
              <p className="text-xs text-muted-foreground">({cert.score} of {cert.questions_total} correct)</p>
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              Issued by <strong className="text-white/70">Novo AI</strong> on {formatDate(cert.issued_at)}
            </p>
            <p className="text-xs mt-1 font-mono" style={{ color: 'var(--ink-500)' }}>
              {cert.share_code.toUpperCase()}
            </p>
          </div>
        </motion.div>

        {cert.pct_score >= 90 && (
          <div className="rounded-2xl px-4 py-3 text-sm text-center font-medium flex items-center justify-center gap-2"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }}>
            <Trophy size={15} /> Distinction — Top 10% score!
          </div>
        )}

        <Button size="lg" onClick={share} className="w-full">
          <Share2 size={17} /> Share Certificate
        </Button>
      </div>
    </motion.div>
  );
}

// ── Assessment flow ───────────────────────────────────────────────────────────

interface SafeQuestion { q: string; options: [string,string,string,string]; }

function AssessmentView({
  assessment,
  onFinish }: {
  assessment: CertificationAssessment;
  onFinish: (passed: boolean, cert: NovoCertification | null) => void;
}) {
  const [currentQ, setCurrentQ]     = useState(assessment.current_q);
  const [questions]                 = useState<SafeQuestion[]>(
    assessment.questions as unknown as SafeQuestion[]
  );
  const [selected, setSelected]     = useState<number | null>(null);
  const [feedback, setFeedback]     = useState<{ correct: boolean; explanation: string; correct_idx: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<{ passed: boolean; pct_score: number; cert: NovoCertification | null } | null>(null);

  const total = questions.length;
  const progress = Math.round((currentQ / total) * 100);

  async function submitAnswer(answerIdx: number) {
    if (submitting || feedback) return;
    setSelected(answerIdx);
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('novo-certifications', {
        body: { action: 'submit_answer', assessment_id: assessment.id, answer_idx: answerIdx },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });

      if (res.error) throw new Error(res.error.message);
      const d = res.data;

      setFeedback({ correct: d.correct, explanation: d.explanation, correct_idx: d.correct_idx });

      if (d.complete) {
        setTimeout(() => {
          setResult({ passed: d.passed, pct_score: d.pct_score, cert: d.certificate ?? null });
        }, 1800);
      }
    } catch (e) {
      console.error('[Assessment] submit error:', e);
    }
    setSubmitting(false);
  }

  function advance() {
    setCurrentQ(q => q + 1);
    setSelected(null);
    setFeedback(null);
  }

  if (result) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 px-4 py-8 text-center">
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center"
          style={{ background: result.passed
            ? 'linear-gradient(135deg, #10B981, #06B6D4)'
            : 'linear-gradient(135deg, #EF4444, #F59E0B)' }}>
          {result.passed ? <Trophy size={44} className="text-white" /> : <RotateCcw size={44} className="text-white" />}
        </div>
        <div>
          <p className="font-heading text-3xl font-bold text-white">
            {result.passed ? 'You Passed!' : 'Not Quite'}
          </p>
          <p className="text-5xl font-bold mt-3"
            style={{ color: result.passed ? '#10B981' : '#EF4444' }}>
            {result.pct_score}%
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {result.passed
              ? `You scored above ${PASS_THRESHOLD}% — mastery confirmed!`
              : `You need ${PASS_THRESHOLD}% to earn a certificate. Keep practising!`}
          </p>
        </div>
        <Button size="lg" onClick={() => onFinish(result.passed, result.cert)} className="w-full">
          {result.passed ? <><Award size={17} /> View Certificate</> : <><RotateCcw size={17} /> Try Again</>}
        </Button>
      </motion.div>
    );
  }

  if (currentQ >= total && !result) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const q = questions[currentQ];
  const OPTION_LABELS = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Question {currentQ + 1} of {total}</span>
          <span>{progress}% done</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-080)' }}>
          <motion.div className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #5B6AF5, #8B5CF6)', width: `${progress}%` }}
            transition={{ duration: 0.4 }} />
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={currentQ}
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
          <div className="rounded-2xl p-4 mb-4"
            style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-100)' }}>
            <p className="text-sm font-semibold text-white leading-relaxed">{q.q}</p>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-2">
            {q.options.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrect = feedback?.correct_idx === i;
              const isWrong = feedback && selected === i && !feedback.correct;

              let bg = 'var(--hdr-b-750)';
              let border = 'var(--ink-080)';
              let textColor = 'var(--ink-850)';
              if (feedback) {
                if (isCorrect) { bg = 'rgba(16,185,129,0.12)'; border = '#10B981'; textColor = '#34D399'; }
                else if (isWrong) { bg = 'rgba(239,68,68,0.12)'; border = '#EF4444'; textColor = '#FCA5A5'; }
              } else if (isSelected) {
                bg = 'rgba(91,106,245,0.15)'; border = '#5B6AF5';
              }

              return (
                <button key={i}
                  onClick={() => !feedback && submitAnswer(i)}
                  disabled={!!feedback || submitting}
                  className="flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all active:scale-[0.98]"
                  style={{ background: bg, borderColor: border }}>
                  <span className="w-6 h-6 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                    style={{ background: isSelected || isCorrect ? border : 'var(--ink-080)', borderColor: border, color: isSelected || isCorrect ? '#fff' : 'var(--ink-400)' }}>
                    {OPTION_LABELS[i]}
                  </span>
                  <span className="text-sm leading-relaxed" style={{ color: textColor }}>{opt}</span>
                  {feedback && isCorrect && <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />}
                  {feedback && isWrong  && <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>

          {/* Feedback box */}
          <AnimatePresence>
            {feedback && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 rounded-2xl px-4 py-3 text-sm leading-relaxed"
                style={{ background: feedback.correct ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                         borderLeft: `3px solid ${feedback.correct ? '#10B981' : '#EF4444'}` }}>
                <p className="font-semibold mb-1" style={{ color: feedback.correct ? '#34D399' : '#FCA5A5' }}>
                  {feedback.correct ? 'Correct!' : 'Incorrect'}
                </p>
                <p style={{ color: 'var(--ink-700)' }}>{feedback.explanation}</p>
                {currentQ < total - 1 && (
                  <button onClick={advance}
                    className="mt-2 text-xs font-bold px-3 py-1.5 rounded-xl"
                    style={{ color: '#8B9BFA', background: 'rgba(91,106,245,0.15)' }}>
                    Next Question →
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type View = 'list' | 'cert_detail' | 'subject_picker' | 'topic_input' | 'assessment' | 'result';

export default function CertificationsPage() {
  const { user } = useAuth();

  const [certs, setCerts]           = useState<NovoCertification[]>([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState<View>('list');
  const [selectedCert, setSelectedCert]       = useState<NovoCertification | null>(null);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [topicInput, setTopicInput]           = useState('');
  const [assessment, setAssessment]           = useState<CertificationAssessment | null>(null);
  const [starting, setStarting]               = useState(false);
  const [_earnedCert, setEarnedCert]           = useState<NovoCertification | null>(null);

  // Check for in-progress assessment to resume on mount
  async function checkForResumable() {
    if (!user) return;
    try {
      const { data: rows } = await supabase
        .from('certification_assessments')
        .select('id, subject, topic, current_q, questions')
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1);

      if (!rows || rows.length === 0) return;
      const row = rows[0];

      // Fetch full assessment via edge function (strips correct_idx for safety)
      const res = await callFn(supabase, { action: 'get_assessment', assessment_id: row.id });
      if (res.error || !res.data?.assessment) return;

      setAssessment(res.data.assessment as CertificationAssessment);
      setView('assessment');
    } catch { /* ignore — non-critical */ }
  }

  async function loadCerts() {
    if (!user) return;
    setLoading(true);
    try {
      const [certsRes] = await Promise.all([
        callFn(supabase, { action: 'get_certificates' }),
        checkForResumable(), // run in parallel; if an in-progress assessment is found, view switches
      ]);
      if (!certsRes.error) setCerts(certsRes.data?.certificates ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { loadCerts(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startAssessment() {
    if (!topicInput.trim() || !selectedSubject) return;
    setStarting(true);
    try {
      const res = await callFn(supabase, {
        action: 'start_assessment',
        subject: selectedSubject,
        topic: topicInput.trim() });
      if (res.error) throw new Error(res.error.message);
      setAssessment(res.data.assessment);
      setView('assessment');
    } catch (e) {
      console.error('[Certs] start assessment error:', e);
    }
    setStarting(false);
  }

  function handleAssessmentFinish(passed: boolean, cert: NovoCertification | null) {
    if (passed && cert) {
      setEarnedCert(cert);
      setCerts(prev => [cert, ...prev]);
      setSelectedCert(cert);
      setView('cert_detail');
      maybePromptRating('first_cert').catch(() => {});
    } else {
      setAssessment(null);
      setView('list');
    }
  }

  // ── Back button logic ─────────────────────────────────────────────────────
  function goBack() {
    if (view === 'cert_detail') { setSelectedCert(null); setView('list'); }
    else if (view === 'assessment') { setAssessment(null); setView('list'); }
    else if (view === 'topic_input') setView('subject_picker');
    else if (view === 'subject_picker') setView('list');
    else setView('list');
  }

  // ── Assessment ────────────────────────────────────────────────────────────
  if (view === 'assessment' && assessment) {
    const isResumed = assessment.current_q > 0;
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <button aria-label="Go back" onClick={goBack} className="text-white"><ChevronLeft size={20} /></button>
          <div className="flex-1">
            <p className="font-heading font-bold text-white text-sm">Certification Assessment</p>
            <p className="text-xs text-muted-foreground">
              {assessment.topic} · {assessment.subject}
              {isResumed && <span className="ml-2 font-semibold" style={{ color: '#FBBF24' }}>· Resumed</span>}
            </p>
          </div>
          <Shield size={18} style={{ color: '#8B9BFA' }} />
        </div>
        {isResumed && (
          <div className="px-4 py-2 shrink-0"
            style={{ background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs font-medium" style={{ color: '#FBBF24' }}>
              ↩ Resuming from question {assessment.current_q + 1} of {assessment.questions.length}
            </p>
          </div>
        )}
        <div className="flex-1 native-scroll pb-nav">
          <AssessmentView assessment={assessment} onFinish={handleAssessmentFinish} />
        </div>
      </div>
    );
  }

  // ── Cert detail ───────────────────────────────────────────────────────────
  if (view === 'cert_detail' && selectedCert) {
    return <CertDetail cert={selectedCert} onBack={goBack} />;
  }

  // ── Topic input ───────────────────────────────────────────────────────────
  if (view === 'topic_input') {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <button aria-label="Go back" onClick={goBack} className="text-white"><ChevronLeft size={20} /></button>
          <p className="font-heading font-bold text-white flex-1">Enter Topic</p>
        </div>
        <div className="flex-1 native-scroll pb-nav px-5 py-8 flex flex-col gap-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <BookOpen size={28} className="text-white" />
            </div>
            <p className="font-heading text-xl font-bold text-white">{selectedSubject}</p>
            <p className="text-sm text-muted-foreground mt-1">
              What specific topic do you want to get certified in?
            </p>
          </div>

          <input
            type="text"
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && startAssessment()}
            placeholder="e.g. Newton's Laws of Motion, Integration by Parts…"
            autoFocus
            className="rounded-2xl px-4 h-14 text-white placeholder:text-white/30 outline-none w-full text-sm"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)', WebkitUserSelect: 'text', userSelect: 'text' }}
          />

          <div className="rounded-2xl px-4 py-3"
            style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)' }}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-650)' }}>
              Novo will generate <strong className="text-white">10 rigorous questions</strong> based on this topic. You need <strong className="text-white">{PASS_THRESHOLD}%</strong> to earn your certificate.
            </p>
          </div>

          <Button size="lg" onClick={startAssessment}
            disabled={!topicInput.trim() || starting} className="w-full">
            {starting ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Generating assessment…</>
            ) : (
              <><Sparkles size={17} /> Start Assessment</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Subject picker ────────────────────────────────────────────────────────
  if (view === 'subject_picker') {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <button aria-label="Go back" onClick={goBack} className="text-white"><ChevronLeft size={20} /></button>
          <p className="font-heading font-bold text-white flex-1">Choose Subject</p>
        </div>
        <div className="flex-1 native-scroll pb-nav px-4 py-4">
          <p className="text-xs text-muted-foreground mb-3 px-1">
            Select the subject for your certification
          </p>
          <div className="grid grid-cols-2 gap-3">
            {SUBJECTS.map(sub => (
              <button key={sub}
                onClick={() => { setSelectedSubject(sub); setView('topic_input'); }}
                className="p-4 rounded-2xl text-sm font-medium text-white text-left transition-colors"
                style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                {sub}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/profile" className="text-white">
          <ChevronLeft size={20} />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <Award size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Novo Certifications</h2>
          <p className="text-xs text-muted-foreground">{certs.length} earned</p>
        </div>
        <Button size="sm" onClick={() => setView('subject_picker')}>
          <Sparkles size={13} /> New
        </Button>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : certs.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-6 pb-8">
            <div className="w-28 h-28 rounded-4xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.1), rgba(139,92,246,0.1))' }}>
              <Award size={56} style={{ color: '#8B9BFA' }} strokeWidth={1.25} />
            </div>
            <div className="text-center px-4">
              <h3 className="font-heading text-2xl font-bold text-white">No Certificates Yet</h3>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                Prove mastery of any topic. Novo will generate a 10-question assessment — score {PASS_THRESHOLD}% or higher to earn your certificate.
              </p>
            </div>
            <div className="rounded-2xl px-4 py-3 w-full max-w-xs"
              style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
              <p className="text-xs text-muted-foreground text-center font-medium">How it works</p>
              <div className="flex flex-col gap-2 mt-2">
                {['Pick a subject & topic', `Score ${PASS_THRESHOLD}%+ on 10 questions`, 'Earn your Novo Certificate'].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-white">
                    <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(91,106,245,0.2)', color: '#8B9BFA' }}>{i+1}</span>
                    {s}
                  </div>
                ))}
              </div>
            </div>
            <Button size="lg" onClick={() => setView('subject_picker')} className="w-full">
              <Sparkles size={17} /> Start First Assessment
            </Button>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
              Your Certificates
            </p>
            <AnimatePresence>
              {certs.map((cert, i) => (
                <motion.div key={cert.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <CertCard cert={cert} onSelect={c => { setSelectedCert(c); setView('cert_detail'); }} />
                </motion.div>
              ))}
            </AnimatePresence>
            <button onClick={() => setView('subject_picker')}
              className="mt-2 py-3 rounded-2xl text-sm font-semibold text-center flex items-center justify-center gap-1.5"
              style={{ border: '1px dashed rgba(91,106,245,0.4)', color: '#8B9BFA' }}>
              <Sparkles size={14} /> Earn Another Certificate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
