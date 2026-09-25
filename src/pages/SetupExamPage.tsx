import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { EXAM_TARGETS, resolveExamName, normaliseExamDate } from '@/lib/examTargets';

// Change/choose the exam target at any time (existing learners on GENERAL, or anyone who wants to switch).
// Deterministic, no AI. Never a gate: Back / "Keep general study" leave without changes.
export default function SetupExamPage() {
  const { user, profile, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const [exam, setExam] = useState<string>(resolveExamName(profile?.exam_name));
  const [date, setDate] = useState<string>(profile?.exam_date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = EXAM_TARGETS.find(e => e.value === exam);
  const today = new Date().toISOString().slice(0, 10);

  async function save() {
    if (!user || saving) return;
    setSaving(true); setError(null);
    const { error: err } = await supabase.from('profiles')
      .update({ exam_name: resolveExamName(exam), exam_date: normaliseExamDate(exam, date) })
      .eq('id', user.id);
    setSaving(false);
    if (err) { setError('We could not save your exam. Check your connection and try again.'); return; }
    await refetchProfile();
    navigate(-1);
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'calc(env(safe-area-inset-top) + 12px) 16px 120px' }}>
      <button onClick={() => navigate(-1)} aria-label="Back" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', background: 'transparent', color: 'var(--ink-950)' }}>
        <ChevronLeft size={22} />
      </button>
      <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 800, margin: '4px 0 6px', color: 'var(--ink-950)' }}>Your exam</h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-650)', marginBottom: 16 }}>
        Novo tailors practice and revision to your exam. Not sure yet? Keep general study — you can change this any time.
      </p>
      <div role="radiogroup" aria-label="Exam target" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {EXAM_TARGETS.map(e => {
          const active = exam === e.value;
          return (
            <button key={e.value} role="radio" aria-checked={active} onClick={() => setExam(e.value)}
              style={{
                minHeight: 52, padding: '12px 16px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 16, fontWeight: 600, color: 'var(--ink-950)', textAlign: 'left',
                background: active ? 'rgba(79,70,229,0.14)' : 'var(--ink-60, rgba(127,127,127,0.08))',
                border: `2px solid ${active ? '#4F46E5' : 'var(--ink-140, rgba(127,127,127,0.25))'}`,
              }}>
              <span>{e.label}</span>{active && <Check size={20} color="#4F46E5" />}
            </button>
          );
        })}
      </div>
      {selected?.hasDate && (
        <label style={{ display: 'block', marginTop: 16 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--ink-950)' }}>Exam date (optional)</span>
          <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)}
            style={{ width: '100%', minHeight: 52, borderRadius: 12, padding: '0 14px', fontSize: 16, border: '2px solid var(--ink-140, rgba(127,127,127,0.25))', background: 'transparent', color: 'var(--ink-950)' }} />
        </label>
      )}
      {error && (
        <div role="alert" style={{ marginTop: 16, display: 'flex', gap: 10, padding: 14, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <AlertCircle size={20} color="#DC2626" style={{ flexShrink: 0 }} /><span style={{ fontSize: 14 }}>{error}</span>
        </div>
      )}
      <button onClick={save} disabled={saving}
        style={{ marginTop: 20, width: '100%', minHeight: 54, borderRadius: 14, fontSize: 17, fontWeight: 700, color: '#fff', background: saving ? 'rgba(79,70,229,0.4)' : '#4F46E5' }}>
        {saving ? 'Saving…' : error ? 'Try again' : 'Save'}
      </button>
    </div>
  );
}
