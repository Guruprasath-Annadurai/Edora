// Route: /cat-syllabus
// Persistent "covered vs. remaining" checklist for the CAT syllabus — CAT
// student feedback said topics feel scattered with no single place to see
// what's done. Static, curated topic tree (src/lib/catSyllabus.ts) with
// per-user completion state (cat_syllabus_progress table), unlike
// RoadmapPage's AI-generated plan which regenerates each time.
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronDown, Check, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { CAT_SYLLABUS, CAT_SYLLABUS_DISCLAIMER, CAT_SYLLABUS_TOTAL_ITEMS, type SyllabusGroup } from '@/lib/catSyllabus';

function GroupAccordion({
  group, done, isOpen, onToggleOpen, onToggleItem,
}: {
  group: SyllabusGroup;
  done: Set<string>;
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleItem: (id: string) => void;
}) {
  const completedCount = group.items.filter(i => done.has(i.id)).length;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
      <button onClick={onToggleOpen} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{group.label}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-450)' }}>
            {completedCount}/{group.items.length} covered{group.weight ? ` · ${group.weight}` : ''}
          </p>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} style={{ color: 'var(--ink-450)' }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            <div className="px-4 pb-3 flex flex-col gap-1.5">
              {group.items.map(item => {
                const checked = done.has(item.id);
                return (
                  <button key={item.id} onClick={() => onToggleItem(item.id)}
                    className="flex items-center gap-3 py-2 px-2.5 rounded-xl text-left active:scale-98 transition-transform"
                    style={{ background: checked ? 'rgba(52,211,153,0.08)' : 'transparent' }}>
                    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
                      style={checked
                        ? { background: '#34D399', borderColor: '#34D399' }
                        : { borderColor: 'var(--ink-120)', background: 'transparent' }}>
                      {checked && <Check size={12} color="#06070D" strokeWidth={3} />}
                    </div>
                    <span className="text-sm leading-snug" style={{ color: checked ? '#34D399' : 'var(--ink-800)' }}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CATSyllabusPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'VARC' | 'DILR' | 'QA'>('QA');

  const loadProgress = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('cat_syllabus_progress').select('item_id').eq('user_id', user.id);
    setDone(new Set((data ?? []).map(r => r.item_id as string)));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  async function toggleItem(itemId: string) {
    if (!user) return;
    const wasChecked = done.has(itemId);
    // Optimistic update — never blocks the tap on a network round trip.
    setDone(prev => {
      const next = new Set(prev);
      if (wasChecked) next.delete(itemId); else next.add(itemId);
      return next;
    });
    if (wasChecked) {
      const { error } = await supabase.from('cat_syllabus_progress').delete().eq('user_id', user.id).eq('item_id', itemId);
      if (error) {
        console.error('[CATSyllabus] failed to uncheck:', error.message);
        setDone(prev => new Set(prev).add(itemId)); // revert
      }
    } else {
      const { error } = await supabase.from('cat_syllabus_progress').upsert({ user_id: user.id, item_id: itemId }, { onConflict: 'user_id,item_id' });
      if (error) {
        console.error('[CATSyllabus] failed to check:', error.message);
        setDone(prev => { const next = new Set(prev); next.delete(itemId); return next; }); // revert
      }
    }
  }

  const overallDone = done.size;
  const overallPct = CAT_SYLLABUS_TOTAL_ITEMS > 0 ? Math.round((overallDone / CAT_SYLLABUS_TOTAL_ITEMS) * 100) : 0;
  const section = CAT_SYLLABUS.find(s => s.id === activeSection)!;
  const sectionItemCount = section.groups.reduce((s, g) => s + g.items.length, 0);
  const sectionDoneCount = section.groups.reduce((s, g) => s + g.items.filter(i => done.has(i.id)).length, 0);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg, #06070D)' }}>
      {/* Header */}
      <div className="px-4 pt-safe-top pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--ink-060)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button aria-label="Go back" onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="font-heading font-extrabold text-white text-lg">CAT Syllabus</h1>
            <p className="text-xs" style={{ color: 'var(--ink-450)' }}>{overallDone}/{CAT_SYLLABUS_TOTAL_ITEMS} topics covered · {overallPct}%</p>
          </div>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--ink-070)' }}>
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#5B6AF5,#8B5CF6)' }}
            animate={{ width: `${overallPct}%` }} transition={{ duration: 0.5 }} />
        </div>

        {/* Honesty disclaimer — always visible, never dismissible. IIM
            publishes no official CAT syllabus; this must never be presented
            as one. */}
        <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Info size={13} style={{ color: '#F59E0B' }} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-500)' }}>{CAT_SYLLABUS_DISCLAIMER}</p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 p-1 rounded-2xl mt-3" style={{ background: 'var(--ink-040)' }}>
          {CAT_SYLLABUS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: activeSection === s.id ? `${s.color}20` : 'transparent', color: activeSection === s.id ? s.color : 'var(--ink-400)' }}>
              {s.id}
            </button>
          ))}
        </div>
      </div>

      {/* Section content */}
      <div className="flex-1 native-scroll px-4 py-4 pb-nav">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${section.color}40`, borderTopColor: section.color }} />
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-450)' }}>
              {section.label} · {sectionDoneCount}/{sectionItemCount} covered
            </p>
            <div className="flex flex-col gap-2">
              {section.groups.map(group => (
                <GroupAccordion
                  key={group.id}
                  group={group}
                  done={done}
                  isOpen={openGroups.has(group.id)}
                  onToggleOpen={() => setOpenGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                    return next;
                  })}
                  onToggleItem={toggleItem}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
