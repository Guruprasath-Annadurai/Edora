import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AtRiskStudent {
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  xp: number;
  current_streak: number;
  risk_level: 'no_streak' | 'low_xp' | 'ok';
}

export function AtRiskPanel() {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(true);

  useEffect(() => {
    supabase.from('at_risk_students').select('*').limit(10).then(({ data }) => {
      setStudents((data ?? []) as AtRiskStudent[]);
      setLoading(false);
    });
  }, []);

  if (!loading && students.length === 0) return null;

  return (
    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 0, marginBottom: open ? 12 : 0 }}
      >
        <AlertTriangle size={16} color="#EF4444" />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#EF4444', flex: 1, textAlign: 'left' }}>
          At-Risk Students {students.length > 0 && `(${students.length})`}
        </span>
        <ChevronRight size={16} color="rgba(239,68,68,0.6)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {loading ? (
              <div style={{ color: 'var(--ink-400)', fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {students.map(s => (
                  <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: 'var(--ink-950)', overflow: 'hidden',
                    }}>
                      {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : s.full_name.split(' ').map(w => w[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-950)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                        {s.current_streak === 0 ? 'No streak' : `${s.current_streak}d streak`} · {s.xp} XP
                      </div>
                    </div>
                    <div style={{
                      padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: s.risk_level === 'no_streak' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                      color: s.risk_level === 'no_streak' ? '#EF4444' : '#F59E0B',
                    }}>
                      {s.risk_level === 'no_streak' ? 'No Streak' : 'Low XP'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
