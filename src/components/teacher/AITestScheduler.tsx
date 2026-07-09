import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function AITestScheduler({ courses: _courses }: { courses: Array<{ id: string; name: string }> }) {
  const [open, setOpen]         = useState(false);
  const [subject, setSubject]   = useState('Mathematics');
  const [topic, setTopic]       = useState('');
  const [qCount, setQCount]     = useState(10);
  const [dueDate, setDueDate]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);

  const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'English'];

  async function scheduleTest() {
    if (!topic.trim()) return;
    setLoading(true);
    // Call the ai-question-gen edge function and create a teacher_assignment
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke('ai-question-gen', {
      body: { subject, chapter: topic, count: qCount, ability_score: 0 },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });

    const questions = res.data?.questions ?? [];
    const qIds = questions.map((q: { id?: string }) => q.id).filter(Boolean);

    await supabase.from('teacher_assignments').insert({
      teacher_id:    session?.user?.id,
      title:         `${subject} — ${topic}`,
      subject,
      topic,
      activity_type: 'quiz',
      due_date:      dueDate || null,
      question_ids:  qIds,
      xp_bonus:      50,
    });

    setLoading(false);
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setOpen(false); setTopic(''); }, 2000);
  }

  return (
    <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 0 }}
      >
        <Brain size={16} color="#A78BFA" />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#A78BFA', flex: 1, textAlign: 'left' }}>
          AI Test Scheduler
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(124,58,237,0.3)', color: '#C4B5FD', padding: '2px 6px', borderRadius: 10 }}>1-CLICK</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ marginTop: 12 }}>
            {success ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10B981', fontWeight: 700, fontSize: 14 }}>
                <CheckCircle2 size={18} />Test scheduled and assigned!
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4, fontWeight: 600 }}>SUBJECT</div>
                  <select value={subject} onChange={e => setSubject(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--ink-100)', borderRadius: 8, color: 'var(--ink-950)', padding: '8px 10px', fontSize: 13 }}>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4, fontWeight: 600 }}>TOPIC / CHAPTER</div>
                  <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Newton's Laws of Motion"
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--ink-100)', borderRadius: 8, color: 'var(--ink-950)', padding: '8px 10px', fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4, fontWeight: 600 }}>QUESTIONS</div>
                    <select value={qCount} onChange={e => setQCount(Number(e.target.value))}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--ink-100)', borderRadius: 8, color: 'var(--ink-950)', padding: '8px 10px', fontSize: 13 }}>
                      {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} MCQs</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4, fontWeight: 600 }}>DUE DATE</div>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--ink-100)', borderRadius: 8, color: 'var(--ink-950)', padding: '8px 10px', fontSize: 13 }} />
                  </div>
                </div>
                <button
                  onClick={scheduleTest}
                  disabled={loading || !topic.trim()}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10,
                    background: 'linear-gradient(135deg,#7C3AED,#A78BFA)', border: 'none',
                    color: 'var(--ink-950)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: loading || !topic.trim() ? 0.6 : 1,
                  }}
                >
                  {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Brain size={16} />}
                  {loading ? 'Generating AI test…' : 'Generate & Assign Test'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
