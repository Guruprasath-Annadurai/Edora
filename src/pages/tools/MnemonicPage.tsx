import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookMarked, ChevronLeft, Sparkles, Copy, RotateCcw, Brain, BookOpen, Music, Puzzle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Toast } from '@capacitor/toast';
import { geminiJSON } from '@/lib/gemini';
import type { LucideIcon } from 'lucide-react';

interface MnemonicResult {
  acronym:     string;
  story:       string;
  rhyme:       string;
  metaphor:    string;
}

const CARDS: { key: keyof MnemonicResult; label: string; Icon: LucideIcon; color: string; bg: string }[] = [
  { key: 'acronym',  label: 'Acronym',      Icon: BookMarked, color: '#A78BFA', bg: 'rgba(124,58,237,0.1)' },
  { key: 'story',    label: 'Memory Story', Icon: BookOpen,   color: '#60A5FA', bg: 'rgba(59,130,246,0.1)' },
  { key: 'rhyme',    label: 'Rhyme',        Icon: Music,      color: '#F472B6', bg: 'rgba(236,72,153,0.1)' },
  { key: 'metaphor', label: 'Metaphor',     Icon: Puzzle,     color: '#34D399', bg: 'rgba(16,185,129,0.1)' },
];

export default function MnemonicPage() {
  const [topic, setTopic]   = useState('');
  const [context, setContext] = useState('');
  const [phase, setPhase]   = useState<'idle' | 'loading' | 'result'>('idle');
  const [result, setResult] = useState<MnemonicResult | null>(null);
  const [error, setError]   = useState('');

  async function generate() {
    if (!topic.trim()) return;
    setPhase('loading'); setError('');
    try {
      const prompt = `Create memorable memory aids for: "${topic}"${context ? ` (context: ${context})` : ''}.
Return ONLY valid JSON (no markdown): {
  "acronym": "A memorable acronym or abbreviation trick with explanation",
  "story": "A short vivid story that encodes the key facts (2-3 sentences)",
  "rhyme": "A catchy rhyme or rhythm that helps remember the concept",
  "metaphor": "A powerful real-world metaphor or analogy that makes this click"
}`;

      const parsed = await geminiJSON<MnemonicResult>(prompt);
      setResult(parsed);
      setPhase('result');
    } catch { setError('Generation failed. Please try again.'); setPhase('idle'); }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    await Toast.show({ text: 'Copied!', duration: 'short', position: 'bottom' });
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <Link aria-label="Go back" to="/tools"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
          <BookMarked size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Mnemonic AI</h2>
          <p className="text-xs text-muted-foreground">AI-generated memory tricks</p>
        </div>
        {phase === 'result' && (
          <button onClick={() => { setPhase('idle'); setResult(null); }}
            className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RotateCcw size={15} className="text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-4">
        <AnimatePresence mode="wait">

          {/* INPUT */}
          {phase !== 'result' && (
            <motion.div key="input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4">
              <div className="rounded-3xl p-5 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(239,68,68,0.12))', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <Brain size={28} style={{ color: '#FBBF24' }} />
                </div>
                <h3 className="font-heading text-base font-bold text-white mt-2">Never Forget Again</h3>
                <p className="text-xs text-muted-foreground mt-1">Get 4 memory techniques for any concept instantly</p>
              </div>

              <input type="text" placeholder="Concept / Formula / Fact (e.g. Krebs Cycle)"
                value={topic} onChange={e => setTopic(e.target.value)}
                className="rounded-2xl px-4 h-14 text-white placeholder:text-white/30 outline-none w-full"
                style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)', WebkitUserSelect: 'text', userSelect: 'text' }} />

              <input type="text" placeholder="Context (optional — e.g. Biology chapter 5)"
                value={context} onChange={e => setContext(e.target.value)}
                className="rounded-2xl px-4 h-11 text-white placeholder:text-white/30 outline-none w-full text-sm"
                style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)', WebkitUserSelect: 'text', userSelect: 'text' }} />

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <Button size="lg" onClick={generate} disabled={!topic.trim() || phase === 'loading'} className="w-full">
                {phase === 'loading'
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Generating…</>
                  : <><Sparkles size={17} /> Generate Mnemonics</>}
              </Button>
            </motion.div>
          )}

          {/* RESULT */}
          {phase === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col gap-3">
              <p className="font-heading font-bold text-white text-base">"{topic}"</p>
              {CARDS.map(({ key, label, Icon, color, bg }) => (
                <motion.div key={key}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl overflow-hidden"
                  style={{ border: `1px solid ${color}30`, background: 'rgba(15,20,45,0.75)' }}>
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ background: bg, borderBottom: `1px solid ${color}20` }}>
                    <div className="flex items-center gap-2">
                      <Icon size={14} style={{ color }} />
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{label}</p>
                    </div>
                    <button onClick={() => copyText(result[key])}
                      className="p-1.5 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${color}30` }}>
                      <Copy size={12} style={{ color }} />
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-sm text-white/85 leading-relaxed">{result[key]}</p>
                  </div>
                </motion.div>
              ))}
              <Button onClick={() => { setPhase('idle'); setResult(null); }} variant="secondary" className="w-full mt-1">
                Try Another Topic
              </Button>
              <div className="h-4" />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
