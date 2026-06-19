import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronUp, ChevronDown, Play, Pause, Type } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Plain-text content to display in reader mode */
  content: string;
  title?: string;
}

const MIN_FONT = 14;
const MAX_FONT = 22;
const MIN_SPEED = 80;   // ms per word (slow)
const MAX_SPEED = 30;   // ms per word (fast)

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function SpeedReaderOverlay({ open, onClose, content, title }: Props) {
  const sentences  = splitSentences(content);
  const [fontSize, setFontSize]   = useState(16);
  const [lineH, setLineH]         = useState(1.7);
  const [speed, setSpeed]         = useState(55);   // ms per word
  const [playing, setPlaying]     = useState(false);
  const [wordIdx, setWordIdx]     = useState(0);
  const words                     = content.split(/\s+/).filter(Boolean);
  const highlightRef              = useRef<HTMLSpanElement>(null);
  const containerRef              = useRef<HTMLDivElement>(null);

  // Auto-advance word highlight
  useEffect(() => {
    if (!playing || wordIdx >= words.length) return;
    const t = setTimeout(() => setWordIdx(i => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, wordIdx, words.length, speed]);

  // Scroll to keep highlighted word in view
  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [wordIdx]);

  // Reset on open
  useEffect(() => {
    if (open) { setWordIdx(0); setPlaying(false); }
  }, [open]);

  const togglePlay = useCallback(() => {
    if (wordIdx >= words.length) setWordIdx(0);
    setPlaying(p => !p);
  }, [wordIdx, words.length]);

  if (!sentences.length) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[600] flex flex-col"
          style={{ background: '#0A0A0F' }}
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: 'rgba(10,10,15,0.9)', borderBottom: '1px solid rgba(124,58,237,0.12)', backdropFilter: 'blur(16px)' }}>
            <div className="flex items-center gap-2">
              <Type size={16} style={{ color: '#A855F7' }} />
              <span className="font-heading font-bold text-white text-sm">{title ?? 'Speed Reader'}</span>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <X size={16} className="text-white" />
            </button>
          </div>

          {/* Controls bar */}
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
            style={{ background: 'rgba(15,17,23,0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

            {/* Font size */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Aa</span>
              <button onClick={() => setFontSize(f => Math.max(MIN_FONT, f - 1))}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <ChevronDown size={13} className="text-white" />
              </button>
              <span className="text-xs font-mono text-white w-6 text-center">{fontSize}</span>
              <button onClick={() => setFontSize(f => Math.min(MAX_FONT, f + 1))}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <ChevronUp size={13} className="text-white" />
              </button>
            </div>

            {/* Play / Pause */}
            <motion.button whileTap={{ scale: 0.92 }} onClick={togglePlay}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full font-semibold text-xs text-white"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
              {playing ? <><Pause size={12} fill="white" /> Pause</> : <><Play size={12} fill="white" /> Guide me</>}
            </motion.button>

            {/* Speed */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Speed</span>
              <button onClick={() => setSpeed(s => Math.min(MIN_SPEED, s + 10))}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <ChevronDown size={13} className="text-white" />
              </button>
              <button onClick={() => setSpeed(s => Math.max(MAX_SPEED, s - 10))}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <ChevronUp size={13} className="text-white" />
              </button>
            </div>
          </div>

          {/* Line spacing */}
          <div className="flex items-center gap-3 px-4 py-2 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Line spacing</span>
            {[1.4, 1.7, 2.1].map(lh => (
              <button key={lh} onClick={() => setLineH(lh)}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium transition-all"
                style={lineH === lh
                  ? { background: 'rgba(124,58,237,0.25)', color: '#C4B5FD', border: '1px solid rgba(124,58,237,0.4)' }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                {lh === 1.4 ? 'Tight' : lh === 1.7 ? 'Normal' : 'Wide'}
              </button>
            ))}
          </div>

          {/* Reading area */}
          <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-6">
            <p style={{ fontSize, lineHeight: lineH, color: 'rgba(255,255,255,0.85)' }}>
              {words.map((word, i) => (
                <span key={i}>
                  {i === wordIdx
                    ? <span ref={highlightRef}
                        className="rounded px-0.5"
                        style={{ background: 'rgba(124,58,237,0.45)', color: '#FFFFFF', fontWeight: 700 }}>
                        {word}
                      </span>
                    : <span style={i < wordIdx ? { color: 'rgba(255,255,255,0.45)' } : {}}>{word}</span>}
                  {' '}
                </span>
              ))}
            </p>
          </div>

          {/* Progress */}
          <div className="shrink-0 px-4 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Progress</span>
              <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {wordIdx}/{words.length} words
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #7C3AED, #A855F7)' }}
                animate={{ width: `${(wordIdx / words.length) * 100}%` }}
                transition={{ duration: 0.3 }} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
