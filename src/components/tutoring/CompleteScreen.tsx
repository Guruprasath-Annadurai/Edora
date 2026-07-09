import { motion } from 'framer-motion';
import { CheckCircle2, Trophy, GraduationCap, Map, Plus, Loader2, Brain } from 'lucide-react';
import { ScoreArc } from '@/components/tutoring/ScoreArc';
import type { ConceptStatus } from '@/lib/tutoringTypes';

interface CompleteScreenProps {
  score: number;
  totalCheckpoints: number;
  xpEarned: number;
  completedConcepts: ConceptStatus[];
  subject: string;
  topic: string;
  onNewSession: () => void;
  onUpdateConceptMap: () => Promise<void>;
  updatingMap: boolean;
  mapUpdated: boolean;
  srCardsCount: number;
}

export function CompleteScreen({
  score, totalCheckpoints, xpEarned, completedConcepts,
  subject, topic, onNewSession, onUpdateConceptMap, updatingMap, mapUpdated, srCardsCount,
}: CompleteScreenProps) {
  const accuracy = totalCheckpoints > 0 ? Math.round((score / totalCheckpoints) * 100) : 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-5 px-4 py-6">

      {/* Celebration header */}
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.2), rgba(139,92,246,0.2))', border: '1px solid rgba(91,106,245,0.3)' }}>
          <GraduationCap size={48} className="text-primary" strokeWidth={1.5} />
        </div>
        <motion.div
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
          animate={{ rotate: [0, 15, -15, 0] }}
          transition={{ duration: 1.2, repeat: 2 }}>
          <Trophy size={14} className="text-white" />
        </motion.div>
      </div>

      <div className="text-center">
        <h2 className="font-heading text-2xl font-bold text-white">Session Complete!</h2>
        <p className="text-sm text-muted-foreground mt-1">{topic} · {subject}</p>
      </div>

      {/* Score row */}
      <div className="flex items-center gap-6">
        <ScoreArc pct={accuracy} size={88} />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-yellow-500" />
            <span className="text-sm font-semibold text-white">
              {score}/{totalCheckpoints} Correct
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <span className="text-[8px] font-bold text-white">XP</span>
            </div>
            <span className="text-sm font-semibold text-primary">+{xpEarned} XP earned</span>
          </div>
          {completedConcepts.length > 0 && (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-sm text-muted-foreground">
                {completedConcepts.filter(c => c.status === 'mastered').length}/{completedConcepts.length} mastered
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Concepts list */}
      {completedConcepts.length > 0 && (
        <div className="w-full rounded-2xl p-4"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Concepts Covered</p>
          <div className="flex flex-col gap-2">
            {completedConcepts.map((concept, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: concept.status === 'mastered' ? 'rgba(16,185,129,0.15)' :
                                concept.status === 'partial'  ? 'rgba(245,158,11,0.15)' : 'var(--ink-080)',
                  }}>
                  {concept.status === 'mastered' && <CheckCircle2 size={12} className="text-green-400" />}
                  {concept.status === 'partial'  && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                  {concept.status === 'pending'  && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--ink-300)' }} />}
                </div>
                <span className="text-sm text-white/85">{concept.title}</span>
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: concept.status === 'mastered' ? '#34D399' : concept.status === 'partial' ? '#FBBF24' : 'var(--ink-300)' }}>
                  {concept.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SR cards badge */}
      {srCardsCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full rounded-2xl p-3 flex items-center gap-3"
          style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.25)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(91,106,245,0.15)' }}>
            <Brain size={16} style={{ color: '#5B6AF5' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white leading-tight">
              {srCardsCount} flashcards added to Spaced Review!
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Your learning style was also updated</p>
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      <div className="w-full flex flex-col gap-3">
        <button
          onClick={onUpdateConceptMap}
          disabled={updatingMap || mapUpdated}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70"
          style={{ background: mapUpdated ? '#10b981' : 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          {updatingMap
            ? <><Loader2 size={16} className="animate-spin" /> Updating…</>
            : mapUpdated
              ? <><CheckCircle2 size={16} /> Concept Map Updated</>
              : <><Map size={16} /> Update Concept Map</>
          }
        </button>
        <button
          onClick={onNewSession}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-120)' }}>
          <Plus size={16} /> New Session
        </button>
      </div>
    </motion.div>
  );
}
