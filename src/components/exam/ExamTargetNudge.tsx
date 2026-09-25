import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { isGeneralExam } from '@/lib/examTargets';

// Calm, dismissible prompt for learners whose exam target is still GENERAL (existing users whose
// NULL was normalised by the backend, or anyone who chose "Not sure yet"). Never blocks anything.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const key = (uid: string) => `edora_exam_nudge_snooze_${uid}`;

export function isNudgeSnoozed(uid: string, now = Date.now()): boolean {
  try { const t = Number(localStorage.getItem(key(uid))); return Number.isFinite(t) && t > now; } catch { return false; }
}
export function snoozeNudge(uid: string, now = Date.now()): void {
  try { localStorage.setItem(key(uid), String(now + SNOOZE_MS)); } catch { /* ignore */ }
}

export function ExamTargetNudge() {
  const { user, profile } = useAuth();
  const [hidden, setHidden] = useState(false);
  if (!user || !profile || hidden || !isGeneralExam(profile.exam_name) || isNudgeSnoozed(user.id)) return null;
  return (
    <div role="region" aria-label="Choose your exam"
      style={{ margin: '0 0 16px', padding: 16, borderRadius: 16, border: '1px solid var(--ink-140, rgba(127,127,127,0.25))', background: 'rgba(79,70,229,0.08)' }}>
      <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Studying for a specific exam?</p>
      <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-650)', marginBottom: 12 }}>
        Tell us which one and Novo can tailor practice and revision to it. You are on general study for now.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link to="/setup-exam" style={{ minHeight: 48, padding: '0 18px', display: 'inline-flex', alignItems: 'center', borderRadius: 12, fontWeight: 700, color: '#fff', background: '#4F46E5' }}>
          Choose exam
        </Link>
        <button onClick={() => { snoozeNudge(user.id); setHidden(true); }}
          style={{ minHeight: 48, padding: '0 14px', fontWeight: 600, color: 'var(--ink-650)', background: 'transparent' }}>
          Not now
        </button>
      </div>
    </div>
  );
}
