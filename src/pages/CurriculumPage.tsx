// ═══════════════════════════════════════════════════════════════
// Edora — CurriculumPage
// Browse exam board curricula, filter by region/level, and enroll.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, X, ChevronDown, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExamBoard {
  id: string;
  code: string;
  name: string;
  country: string;
  region: string;
  level: string;
  description: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COUNTRY_FLAG: Record<string, string> = {
  GB: '🇬🇧', IN: '🇮🇳', US: '🇺🇸', AU: '🇦🇺', CA: '🇨🇦',
  SG: '🇸🇬', HK: '🇭🇰', CN: '🇨🇳', KR: '🇰🇷', JP: '🇯🇵',
  FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹', ES: '🇪🇸', NL: '🇳🇱',
  PL: '🇵🇱', AE: '🇦🇪', EG: '🇪🇬', NG: '🇳🇬', ZA: '🇿🇦',
  CH: '🇨🇭',
};

const REGIONS = ['All', 'UK', 'India', 'USA', 'International', 'Australia', 'Asia-Pacific', 'Europe', 'MENA/Africa', 'Professional'];
const LEVELS  = ['All', 'Secondary', 'Pre-University', 'University', 'Professional'];

const POPULAR_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'English', 'History', 'Economics', 'Computer Science',
  'Psychology', 'Geography',
];

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  Secondary:       { bg: 'rgba(16,185,129,0.15)',  text: '#10B981' },
  'Pre-University': { bg: 'rgba(91,106,245,0.15)',  text: '#5B6AF5' },
  University:      { bg: 'rgba(245,158,11,0.15)',  text: '#F59E0B' },
  Professional:    { bg: 'rgba(139,92,246,0.15)',  text: '#8B5CF6' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function countryFlag(code: string): string {
  return COUNTRY_FLAG[code.toUpperCase()] ?? '🌍';
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/10" />
          <div className="h-4 w-28 rounded bg-white/10" />
        </div>
        <div className="h-3 w-3/4 rounded bg-white/10" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full bg-white/10" />
          <div className="h-5 w-20 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

// ── Board Card ────────────────────────────────────────────────────────────────

interface BoardCardProps {
  board: ExamBoard;
  onSelect: (board: ExamBoard) => void;
  index: number;
}

function BoardCard({ board, onSelect, index }: BoardCardProps) {
  const flag = countryFlag(board.country);
  const levelStyle = LEVEL_COLORS[board.level] ?? { bg: 'rgba(255,255,255,0.1)', text: '#9CA3AF' };

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28 }}
      onClick={() => onSelect(board)}
      className="text-left rounded-2xl p-4 transition-all active:scale-[0.97] hover:scale-[1.02]"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
      }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Flag + name */}
      <div className="flex items-start gap-2.5 mb-2">
        <span className="text-2xl leading-none mt-0.5">{flag}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm leading-tight truncate">{board.name}</p>
          <p className="text-xs text-white/50 mt-0.5 font-mono">{board.code}</p>
        </div>
      </div>

      {/* Description */}
      {board.description && (
        <p className="text-xs text-white/60 leading-relaxed mb-3 line-clamp-2">{board.description}</p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(91,106,245,0.2)', color: '#818CF8' }}
        >
          {board.region}
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: levelStyle.bg, color: levelStyle.text }}
        >
          {board.level}
        </span>
      </div>
    </motion.button>
  );
}

// ── Subject Sheet ─────────────────────────────────────────────────────────────

interface SubjectSheetProps {
  board: ExamBoard;
  onClose: () => void;
  onSelectSubject: (subject: string) => void;
}

function SubjectSheet({ board, onClose, onSelectSubject }: SubjectSheetProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed) onSelectSubject(trimmed);
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl pb-10"
        style={{
          background: 'linear-gradient(180deg, #1E2440 0%, #141829 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pt-2 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-bold text-base">{board.name}</p>
              <p className="text-white/50 text-xs mt-0.5">Choose a subject</p>
            </div>
            <button
              aria-label="Close"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <X size={15} className="text-white/70" />
            </button>
          </div>

          {/* Text input */}
          <div
            className="flex items-center gap-2.5 rounded-2xl px-4 py-3 mb-4"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <BookOpen size={16} className="text-white/40 shrink-0" />
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Mathematics, Physics, English…"
              className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none"
            />
            {text.trim() && (
              <button
                onClick={handleSubmit}
                className="px-3 py-1 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
              >
                Go
              </button>
            )}
          </div>

          {/* Popular subjects */}
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-2.5">
            Popular subjects
          </p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SUBJECTS.map(subj => (
              <button
                key={subj}
                onClick={() => onSelectSubject(subj)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white/80 transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {subj}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ── Module-level cache — survives navigation within the session ───────────────
let _boardsCache: ExamBoard[] | null = null;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
  const navigate = useNavigate();

  const [boards,        setBoards]        = useState<ExamBoard[]>(_boardsCache ?? []);
  const [loading,       setLoading]       = useState(_boardsCache === null);
  const [error,         setError]         = useState<string | null>(null);
  const [activeRegion,  setActiveRegion]  = useState('All');
  const [activeLevel,   setActiveLevel]   = useState('All');
  const [search,        setSearch]        = useState('');
  const [selectedBoard, setSelectedBoard] = useState<ExamBoard | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('curriculum-builder', {
        body: { action: 'list_boards' },
      });
      if (fnError) throw fnError;
      if (!mountedRef.current) return;
      const fetched = data?.boards ?? [];
      _boardsCache = fetched;
      setBoards(fetched);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[CurriculumPage] fetchBoards:', err);
      setError('Failed to load boards. Check your connection.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  // ── Filter ──
  const filtered = boards.filter(b => {
    if (activeRegion !== 'All' && b.region !== activeRegion) return false;
    if (activeLevel  !== 'All' && b.level  !== activeLevel)  return false;
    if (search) {
      const q = search.toLowerCase();
      if (!b.name.toLowerCase().includes(q) && !b.code.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function handleSelectSubject(subject: string) {
    if (!selectedBoard) return;
    setSelectedBoard(null);
    navigate(`/curriculum/${selectedBoard.code}/${encodeURIComponent(subject)}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'transparent' }}
    >
      {/* ── Header ── */}
      <div
        className="shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ArrowLeft size={17} className="text-white/80" />
          </button>
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">Curricula</h1>
            <p className="text-white/50 text-xs">Find your exam board</p>
          </div>
        </div>

        {/* Search bar */}
        <div
          className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 mt-3"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <Search size={15} className="text-white/40 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search boards or codes…"
            className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none"
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch('')}>
              <X size={14} className="text-white/40" />
            </button>
          )}
        </div>
      </div>

      {/* ── Region tabs ── */}
      <div className="shrink-0 px-4 py-2.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-2 w-max">
          {REGIONS.map(region => {
            const active = region === activeRegion;
            return (
              <button
                key={region}
                onClick={() => setActiveRegion(region)}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95"
                style={
                  active
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: '#fff' }
                    : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }
                }
              >
                {region}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Level chips ── */}
      <div className="shrink-0 px-4 pb-2.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-2 w-max">
          {LEVELS.map(level => {
            const active = level === activeLevel;
            return (
              <button
                key={level}
                onClick={() => setActiveLevel(level)}
                className="px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95"
                style={
                  active
                    ? { background: 'rgba(91,106,245,0.3)', color: '#818CF8', border: '1px solid rgba(91,106,245,0.5)' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.08)' }
                }
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-nav" style={{ scrollbarWidth: 'none' }}>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-red-400 text-sm flex-1">{error}</p>
            <button
              onClick={fetchBoards}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Count */}
        {!loading && !error && (
          <p className="text-white/30 text-xs mb-3">
            {filtered.length} board{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        {/* Skeleton grid */}
        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Boards grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((board, i) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  index={i}
                  onSelect={setSelectedBoard}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center py-16 px-4"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.25)' }}
            >
              <Search size={28} style={{ color: '#818CF8' }} />
            </div>
            <p className="text-white/60 font-semibold text-sm mb-1">No boards found</p>
            <p className="text-white/30 text-xs">Try adjusting the filters or search</p>
          </motion.div>
        )}
      </div>

      {/* ── Subject sheet ── */}
      <AnimatePresence>
        {selectedBoard && (
          <SubjectSheet
            board={selectedBoard}
            onClose={() => setSelectedBoard(null)}
            onSelectSubject={handleSelectSubject}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
