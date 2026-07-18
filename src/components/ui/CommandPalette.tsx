import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {spring} from '@/lib/motion';
import { Search, Clock, X, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Feature,
  CATEGORY_ORDER,
  searchFeatures,
  getRecentFeatures,
  recordRecentFeature } from '@/lib/featureRegistry';
import { useHaptic } from '@/hooks/useHaptic';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { light, medium } = useHaptic();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  const [query,    setQuery]    = useState('');
  const [cursor,   setCursor]   = useState(0);
  const [recents,  setRecents]  = useState<Feature[]>([]);

  const results  = query.trim() ? searchFeatures(query) : [];
  const showRecents = !query.trim() && recents.length > 0;

  // Flat list for keyboard nav
  const flatList: Feature[] = query.trim()
    ? results
    : recents;

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setRecents(getRecentFeatures());
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const select = useCallback((f: Feature) => {
    medium();
    recordRecentFeature(f.to);
    onClose();
    navigate(f.to);
  }, [medium, navigate, onClose]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Scroll cursor into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-cmd-item]');
    items[cursor]?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!flatList.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      light();
      setCursor(c => Math.min(c + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      light();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[cursor]) select(flatList[cursor]);
    }
  }, [flatList, cursor, light, select]);

  // Group search results by category
  const grouped: Record<string, Feature[]> = {};
  if (query.trim()) {
    for (const f of results) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    }
  }

  let runningIdx = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[900]"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed left-4 right-4 z-[901] rounded-2xl overflow-hidden flex flex-col"
            style={{
              top: 'max(env(safe-area-inset-top, 0px) + 16px, 60px)',
              maxHeight: 'calc(100dvh - 140px)',
              background: 'var(--hdr-a-880)',
              backdropFilter: 'blur(72px) saturate(220%) brightness(1.04)',
              WebkitBackdropFilter: 'blur(72px) saturate(220%) brightness(1.04)',
              border: '1px solid rgba(124,58,237,0.28)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(124,58,237,0.18)' }}
            initial={{ y: -24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.97 }}
            transition={spring.snappy}
            onKeyDown={onKeyDown}
          >
            {/* Search bar */}
            <div className="flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: '1px solid var(--ink-070)' }}>
              <Search size={16} style={{ color: '#A855F7', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search anything in Edora…"
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/30"
                style={{ fontFamily: 'inherit' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {query && (
                <button aria-label="Close" onClick={() => setQuery('')}
                  className="flex items-center justify-center"
                  style={{ width: 28, height: 28 }}>
                  <X size={14} className="text-white/40" />
                </button>
              )}
              <button onClick={onClose}
                className="flex items-center justify-center rounded-lg text-xs font-medium px-2 py-1"
                style={{ background: 'var(--ink-060)', color: 'var(--ink-400)', border: '1px solid var(--ink-080)' }}>
                esc
              </button>
            </div>

            {/* Results */}
            <div ref={listRef} className="overflow-y-auto flex-1 pb-2">

              {/* Recent items */}
              {showRecents && (
                <section>
                  <p className="px-4 pt-3 pb-1.5 text-xs font-bold tracking-widest uppercase"
                    style={{ color: 'var(--ink-250)' }}>
                    Recent
                  </p>
                  {recents.map((f, i) => {
                    const active = cursor === i;
                    return (
                      <FeatureRow
                        key={f.to}
                        feature={f}
                        active={active}
                        icon={<Clock size={11} />}
                        onSelect={() => select(f)}
                        onHover={() => setCursor(i)}
                      />
                    );
                  })}
                </section>
              )}

              {/* Search results grouped by category */}
              {query.trim() && results.length > 0 && CATEGORY_ORDER.filter(c => grouped[c]).map(cat => {
                const items = grouped[cat];
                const sectionStart = runningIdx;
                runningIdx += items.length;
                return (
                  <section key={cat}>
                    <p className="px-4 pt-3 pb-1.5 text-xs font-bold tracking-widest uppercase"
                      style={{ color: 'var(--ink-250)' }}>
                      {cat}
                    </p>
                    {items.map((f, j) => {
                      const idx = sectionStart + j;
                      return (
                        <FeatureRow
                          key={f.to}
                          feature={f}
                          active={cursor === idx}
                          onSelect={() => select(f)}
                          onHover={() => setCursor(idx)}
                        />
                      );
                    })}
                  </section>
                );
              })}

              {/* Empty state */}
              {query.trim() && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Search size={28} className="text-white/25" strokeWidth={1.6} />
                  <p className="text-sm" style={{ color: 'var(--ink-500)' }}>
                    No results for <span className="text-white/60">"{query}"</span>
                  </p>
                </div>
              )}

              {/* Empty recent state */}
              {!query.trim() && recents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="text-3xl">✨</span>
                  <p className="text-sm" style={{ color: 'var(--ink-500)' }}>
                    Start typing to explore Edora
                  </p>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderTop: '1px solid var(--ink-050)', background: 'rgba(0,0,0,0.2)' }}>
              <span className="text-xs" style={{ color: 'var(--ink-200)' }}>
                ↑↓ navigate · ↵ open · esc dismiss
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface RowProps {
  feature: Feature;
  active: boolean;
  icon?: React.ReactNode;
  onSelect: () => void;
  onHover: () => void;
}

function FeatureRow({ feature: f, active, icon, onSelect, onHover }: RowProps) {
  return (
    <button
      data-cmd-item
      onClick={onSelect}
      onMouseEnter={onHover}
      className="w-full flex items-center gap-3 px-4 text-left transition-colors"
      style={{
        minHeight: 52,
        background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
        borderLeft: active ? '2px solid #7C3AED' : '2px solid transparent' }}
    >
      <span className="text-lg flex-shrink-0 w-7 text-center" aria-hidden>
        {f.emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white truncate">{f.label}</span>
        {f.desc && (
          <span className="block text-xs truncate" style={{ color: 'var(--ink-400)' }}>
            {f.desc}
          </span>
        )}
      </span>
      {icon
        ? <span style={{ color: 'var(--ink-250)', flexShrink: 0 }}>{icon}</span>
        : <ChevronRight size={13} style={{ color: 'var(--ink-200)', flexShrink: 0 }} />
      }
    </button>
  );
}
