import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { CheckpointQuestion } from '@/lib/tutoringTypes';

interface MCQCardProps {
  checkpoint: CheckpointQuestion;
  onAnswer: (idx: number) => void;
  answered: boolean;
  selectedIdx: number | null;
  correctIdx: number | null;
}

export function MCQCard({ checkpoint, onAnswer, answered, selectedIdx, correctIdx }: MCQCardProps) {
  const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="rounded-2xl p-4 w-full"
      style={{ background: 'var(--hdr-b-900)', border: '1px solid var(--ink-080)' }}>

      {/* Difficulty badge */}
      {checkpoint.difficulty && (
        <div className="mb-3">
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(91,106,245,0.1)', color: '#5B6AF5' }}>
            {checkpoint.difficulty}{checkpoint.level != null ? ` (Level ${checkpoint.level})` : ''}
          </span>
        </div>
      )}

      {/* Question */}
      <p className="text-sm font-semibold text-white leading-snug mb-4">
        {checkpoint.question}
      </p>

      {/* Options */}
      <div className="flex flex-col gap-2">
        {checkpoint.options.map((opt, i) => {
          const label = OPTION_LABELS[i] ?? String(i + 1);
          const isSelected  = selectedIdx === i;
          const isCorrect   = correctIdx === i;
          const isWrong     = answered && isSelected && !isCorrect;

          let bg: string;
          let border: string;
          let labelBg: string;
          let icon: React.ReactNode = null;

          if (answered) {
            if (isCorrect) {
              bg = 'rgba(16,185,129,0.12)'; border = 'rgba(16,185,129,0.4)';
              labelBg = '#10B981';
              icon = <CheckCircle2 size={15} className="text-green-400 ml-auto shrink-0" />;
            } else if (isWrong) {
              bg = 'rgba(239,68,68,0.12)'; border = 'rgba(239,68,68,0.4)';
              labelBg = '#EF4444';
              icon = <XCircle size={15} className="text-red-400 ml-auto shrink-0" />;
            } else {
              bg = 'var(--ink-035)'; border = 'var(--ink-060)';
              labelBg = 'var(--ink-080)';
            }
          } else if (isSelected) {
            bg = 'rgba(91,106,245,0.15)'; border = 'rgba(91,106,245,0.5)';
            labelBg = '#5B6AF5';
          } else {
            bg = 'var(--ink-055)'; border = 'var(--ink-080)';
            labelBg = 'var(--ink-100)';
          }

          return (
            <button
              key={i}
              onClick={() => !answered && onAnswer(i)}
              disabled={answered}
              className="w-full text-left p-3.5 rounded-xl border transition-all active:scale-[0.98]"
              style={{ background: bg, borderColor: border }}>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 transition-all"
                  style={{ background: labelBg }}>
                  {label}
                </span>
                <span className="text-sm text-white/85 flex-1">{opt.text ?? (opt as unknown as string)}</span>
                {icon}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
