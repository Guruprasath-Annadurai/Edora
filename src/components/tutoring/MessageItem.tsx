import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, BookOpen } from 'lucide-react';
import { NovoAvatar } from '@/components/tutoring/NovoAvatar';
import { MCQCard } from '@/components/tutoring/MCQCard';
import { renderMarkdown } from '@/lib/tutoringMarkdown';
import type { TutoringMessage } from '@/lib/tutoringTypes';

interface MessageItemProps {
  msg: TutoringMessage;
  displayContent?: string;  // streamed partial text while typewriter animates
  isTyping?: boolean;
  onAnswer?: (idx: number) => void;
  answered?: boolean;
  selectedIdx?: number | null;
  correctIdx?: number | null;
}

export function MessageItem({ msg, displayContent, isTyping, onAnswer, answered, selectedIdx, correctIdx }: MessageItemProps) {
  if (msg.type === 'transition') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] font-medium text-muted-foreground px-2 text-center">
          {msg.conceptTitle || msg.content}
        </span>
        <div className="flex-1 h-px bg-border" />
      </motion.div>
    );
  }

  if (msg.type === 'objective') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4"
        style={{ background: 'var(--ink-060)', border: '1px solid rgba(91,106,245,0.2)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <BookOpen size={13} className="text-white" />
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Learning Objectives</p>
        </div>
        {msg.objectives && msg.objectives.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {msg.objectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: 'var(--ink-950)' }}>
                  {i + 1}
                </span>
                <span className="text-sm text-white/85 leading-snug">{obj}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-white/85 leading-relaxed">{msg.content}</p>
        )}
      </motion.div>
    );
  }

  if (msg.type === 'checkpoint_question' && msg.checkpointData) {
    return (
      <div className="flex items-start gap-2">
        <NovoAvatar size={32} />
        <div className="flex-1 min-w-0">
          <MCQCard
            checkpoint={msg.checkpointData}
            onAnswer={onAnswer ?? (() => {})}
            answered={answered ?? false}
            selectedIdx={selectedIdx ?? null}
            correctIdx={correctIdx ?? null}
          />
        </div>
      </div>
    );
  }

  if (msg.type === 'checkpoint_answer') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="self-end flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={msg.isCorrect
          ? { background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }
          : { background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}>
        {msg.isCorrect
          ? <><CheckCircle2 size={12} /> Correct!</>
          : <><XCircle size={12} /> {msg.content}</>
        }
      </motion.div>
    );
  }

  if (msg.type === 'feedback') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className="ml-10 border-l-2 border-primary/30 pl-3 py-1">
        <div className="flex items-start gap-1.5">
          {msg.isCorrect === true  && <CheckCircle2 size={13} className="text-green-500 shrink-0 mt-0.5" />}
          {msg.isCorrect === false && <XCircle      size={13} className="text-red-500 shrink-0 mt-0.5" />}
          <p className="text-xs text-muted-foreground italic leading-relaxed">{msg.content}</p>
        </div>
      </motion.div>
    );
  }

  // Student message
  if (msg.role === 'student') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="flex justify-end">
        <div
          className="px-4 py-3 rounded-2xl rounded-br-sm text-sm text-white max-w-[80%] leading-relaxed"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          {msg.content}
        </div>
      </motion.div>
    );
  }

  // Default Novo text message
  const visibleContent = displayContent ?? msg.content;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="flex items-start gap-2">
      <NovoAvatar size={32} />
      <div className="rounded-2xl rounded-bl-sm px-4 py-3 max-w-[82%]"
        style={{ background: 'var(--hdr-b-900)', border: '1px solid var(--ink-080)' }}>
        <div className="text-sm text-white/85 leading-relaxed">
          {isTyping
            ? <>{visibleContent}<span className="inline-block ml-0.5 w-0.5 h-[1em] align-middle bg-white/50 animate-pulse" /></>
            : renderMarkdown(visibleContent)
          }
        </div>
      </div>
    </motion.div>
  );
}
