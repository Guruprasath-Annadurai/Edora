import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, BookOpen, Atom, Calculator, FlaskConical, Microscope, Code2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const SUBJECTS = [
  { label: 'Math',     value: 'Mathematics',        Icon: Calculator,   color: '#93C5FD', bg: 'rgba(59,130,246,0.15)'  },
  { label: 'Physics',  value: 'Physics',             Icon: Atom,         color: '#C4B5FD', bg: 'rgba(124,58,237,0.15)' },
  { label: 'Chem',     value: 'Chemistry',           Icon: FlaskConical, color: '#6EE7B7', bg: 'rgba(16,185,129,0.15)' },
  { label: 'Bio',      value: 'Biology',             Icon: Microscope,   color: '#86EFAC', bg: 'rgba(34,197,94,0.15)'  },
  { label: 'English',  value: 'English',             Icon: BookOpen,     color: '#FCA5A5', bg: 'rgba(249,115,22,0.15)' },
  { label: 'CS',       value: 'Computer Science',    Icon: Code2,        color: '#DDD6FE', bg: 'rgba(139,92,246,0.15)' },
];

export function QuickStartFAB() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hiddenByOverlay, setHiddenByOverlay] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Full-screen sheets (e.g. the study break player) dispatch this so the FAB
  // doesn't float over their controls — it lives in a separate stacking
  // context (AppShell) that z-index alone can't reliably order against.
  useEffect(() => {
    const onOverlay = (e: Event) => setHiddenByOverlay(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('novo:overlay-open', onOverlay);
    return () => window.removeEventListener('novo:overlay-open', onOverlay);
  }, []);

  async function startQuiz(subject: string) {
    if (!user || loading) return;
    setSelected(subject);
    setLoading(true);
    abortRef.current = new AbortController();

    try {
      // Navigate immediately — quiz page will receive subject and start generating
      setOpen(false);
      navigate(`/quiz?subject=${encodeURIComponent(subject)}&instant=true`);
    } catch {
      // fallback — navigate anyway
      navigate(`/quiz?subject=${encodeURIComponent(subject)}`);
    } finally {
      setLoading(false);
      setSelected(null);
    }
  }

  if (!user || hiddenByOverlay) return null;

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Subject picker sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
            style={{
              bottom: 0,
              background: 'linear-gradient(180deg,var(--grad-fab-1) 0%,var(--grad-fab-2) 100%)',
              border: '1px solid var(--ink-080)',
              borderBottom: 'none',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--ink-150)' }} />
            </div>

            <div className="px-5 pb-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-heading text-lg font-extrabold text-white">Quick Start</h2>
                  <p className="text-xs text-white/40 mt-0.5">Pick a subject — quiz starts instantly</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close quick start"
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-080)' }}
                >
                  <X size={14} className="text-white/50" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {SUBJECTS.map(({ label, value, Icon, color, bg }) => (
                  <motion.button
                    key={value}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => startQuiz(value)}
                    disabled={loading}
                    aria-label={`Start ${label} quiz`}
                    className="flex flex-col items-center gap-2 py-4 rounded-2xl relative overflow-hidden"
                    style={{ background: bg, border: `1px solid ${color}25` }}
                  >
                    {selected === value && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{ background: `${bg}` }}
                      />
                    )}
                    <div className="relative z-10 flex flex-col items-center gap-1.5">
                      {selected === value ? (
                        <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <Icon size={22} style={{ color }} />
                      )}
                      <span className="text-xs font-bold" style={{ color }}>{label}</span>
                    </div>
                  </motion.button>
                ))}
              </div>

              <p className="text-center text-[11px] text-white/25 font-medium mt-4">
                Novo will generate your first question in under 5 seconds
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(v => !v)}
        aria-label="Quick start a quiz"
        className="fab-button fixed z-30 flex items-center gap-2.5 rounded-full shadow-lg"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) + 88px)',
          right: 20,
          background: open
            ? 'var(--surface-scrim)'
            : 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
          border: open ? '1.5px solid rgba(91,106,245,0.4)' : 'none',
          boxShadow: open
            ? '0 4px 20px rgba(91,106,245,0.2)'
            : '0 8px 32px rgba(91,106,245,0.55), 0 2px 8px rgba(0,0,0,0.4)',
          padding: '12px 18px',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}
        initial={false}
        animate={{ rotate: open ? 45 : 0 }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="x" initial={{ opacity: 0, rotate: -45 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0 }}>
              <X size={18} className="text-white/60" />
            </motion.span>
          ) : (
            <motion.span key="zap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2">
              <Zap size={18} className="text-white fill-white" />
              <span className="fab-label-text text-sm font-extrabold text-white">Quick Start</span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
