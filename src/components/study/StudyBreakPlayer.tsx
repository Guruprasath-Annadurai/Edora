import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Music, Music2, CloudRain, Coffee, Waves, Play, Pause, SkipForward, Clock, Lock } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { track } from '@/lib/analytics';
import { YouTubeSearchPanel } from './YouTubeSearchPanel';
import type { YouTubeTrack } from '@/lib/youtubeSearch';

type Source = 'curated' | 'search';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Initial break duration in minutes — student can adjust 10-25 via slider */
  breakMin?: number;
  /** Today's mood check-in value (e.g. 'anxious', 'focused') — drives auto-pick */
  mood?: string | null;
  /** Once the timer starts, the sheet can't be dismissed until time is up */
  enforceBreak?: boolean;
}

const MIN_BREAK = 10;
const MAX_BREAK = 25;

// Curated playlists via YouTube's official listType=search embed —
// no hardcoded video IDs to rot, free for every user, no login required.
const PLAYLISTS = [
  { id: 'lofi',      label: 'Lo-fi Beats',     icon: Music,     ytQuery: 'lofi hip hop radio beats to study',       moods: ['focused', 'determined', 'good'] },
  { id: 'rain',      label: 'Rain & Thunder',  icon: CloudRain, ytQuery: 'rain and thunder sounds for sleep study', moods: ['anxious', 'low'] },
  { id: 'cafe',      label: 'Café Ambience',   icon: Coffee,    ytQuery: 'coffee shop ambience study sounds',       moods: ['okay', 'good'] },
  { id: 'brown',     label: 'Brown Noise',     icon: Waves,     ytQuery: 'brown noise for focus 1 hour',            moods: ['anxious', 'determined'] },
  { id: 'classical', label: 'Focus Classical', icon: Music2,    ytQuery: 'classical music for studying focus',      moods: ['focused', 'okay'] },
];

// Pick the playlist best suited to today's mood; falls back to Lo-fi.
function autoPickIndex(mood?: string | null): number {
  if (!mood) return 0;
  const idx = PLAYLISTS.findIndex(p => p.moods.includes(mood));
  return idx >= 0 ? idx : 0;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function StudyBreakPlayer({ open, onClose, breakMin = 10, mood = null, enforceBreak = false }: Props) {
  const [durationMin, setDurationMin] = useState(Math.min(Math.max(breakMin, MIN_BREAK), MAX_BREAK));
  const totalSecs = durationMin * 60;
  const [selectedIdx, setSelectedIdx] = useState(() => autoPickIndex(mood));
  const [source, setSource]           = useState<Source>('curated');
  const [playing, setPlaying]         = useState(false);
  const [remaining, setRemaining]     = useState(totalSecs);
  const [ended, setEnded]             = useState(false);
  const [nowPlaying, setNowPlaying]   = useState<YouTubeTrack | null>(null);
  const playerRef = useRef<HTMLIFrameElement>(null);

  const locked = enforceBreak && playing && remaining > 0;

  // Reset on open — re-run mood auto-pick each time the sheet opens
  useEffect(() => {
    if (open) {
      setDurationMin(Math.min(Math.max(breakMin, MIN_BREAK), MAX_BREAK));
      setSelectedIdx(autoPickIndex(mood));
      setPlaying(false);
      setEnded(false);
      setNowPlaying(null);
      track('study_break_opened', { mood: mood ?? 'unknown', break_min: breakMin, enforce: enforceBreak });
    }
    // Tell the global Quick-Start FAB to hide while this full-screen sheet
    // is open — it renders in a separate stacking context (AppShell) that
    // sometimes floats above this modal, so hiding it explicitly is more
    // reliable than fighting z-index.
    window.dispatchEvent(new CustomEvent('novo:overlay-open', { detail: open }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Send a YouTube IFrame API command to the embedded player (postMessage —
  // no external script needed since the embed URL already sets enablejsapi=1).
  function sendPlayerCommand(func: 'playVideo' | 'pauseVideo') {
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      'https://www.youtube.com',
    );
  }

  function selectTrack(t: YouTubeTrack) {
    setNowPlaying(t);
    setPlaying(true);
  }

  // Duration slider changes reset the countdown (only while not actively playing)
  useEffect(() => {
    if (!playing) setRemaining(durationMin * 60);
  }, [durationMin, playing]);

  // Countdown — only ticks when playing
  useEffect(() => {
    if (!playing || remaining <= 0) return;
    const t = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          setEnded(true);
          setPlaying(false);
          track('study_break_completed', { break_min: durationMin, mood: mood ?? 'unknown' });
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, remaining, durationMin, mood]);

  async function haptic() {
    if (Capacitor.isNativePlatform()) await Haptics.impact({ style: ImpactStyle.Light });
  }

  function togglePlay() {
    haptic();
    setPlaying(p => {
      const next = !p;
      if (next) track('study_break_started', { break_min: durationMin, mood: mood ?? 'unknown', playlist: playlist.id, source });
      if (nowPlaying) sendPlayerCommand(next ? 'playVideo' : 'pauseVideo');
      return next;
    });
  }

  function handleClose() {
    if (locked) return; // enforced break — ignore dismiss attempts while running
    if (playing) track('study_break_skipped', { break_min: durationMin, remaining_secs: remaining });
    onClose();
  }

  const playlist = PLAYLISTS[selectedIdx];
  const progress = 1 - remaining / totalSecs;

  const moodHint = useMemo(() => {
    if (!mood) return null;
    const picked = PLAYLISTS[autoPickIndex(mood)];
    return `Picked ${picked.label} for how you're feeling today`;
  }, [mood]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[700] flex items-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

          <motion.div className="relative w-full rounded-t-[32px] overflow-hidden"
            style={{ background: 'var(--surface-sheet)', borderTop: '1px solid rgba(124,58,237,0.3)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}>

            {/* Progress bar */}
            <div className="absolute top-0 left-0 h-0.5 transition-all duration-1000"
              style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, #7C3AED, #A855F7)' }} />

            <div className="px-5 pt-5 pb-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Music size={16} style={{ color: '#A855F7' }} />
                  <p className="font-heading font-bold text-white text-sm">Study Break</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)' }}>
                    <Clock size={11} style={{ color: '#A855F7' }} />
                    <span className="text-xs font-bold tabular-nums" style={{ color: '#A855F7' }}>
                      {formatTime(remaining)}
                    </span>
                  </div>
                  <button onClick={handleClose} disabled={locked}
                    className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                    style={{ background: 'var(--ink-060)' }}>
                    {locked ? <Lock size={13} className="text-white" /> : <X size={14} className="text-white" />}
                  </button>
                </div>
              </div>

              {moodHint && !playing && (
                <p className="text-xs mb-3" style={{ color: 'rgba(168,85,247,0.75)' }}>{moodHint}</p>
              )}

              {/* Duration slider — 10 to 25 minutes */}
              {!playing && !ended && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: 'var(--ink-500)' }}>Break length</span>
                    <span className="text-xs font-bold" style={{ color: '#C4B5FD' }}>{durationMin} min</span>
                  </div>
                  <input
                    type="range"
                    min={MIN_BREAK}
                    max={MAX_BREAK}
                    step={1}
                    value={durationMin}
                    onChange={e => { haptic(); setDurationMin(Number(e.target.value)); }}
                    className="w-full accent-[#7C3AED]"
                  />
                </div>
              )}

              {/* Playlist selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-5">
                {PLAYLISTS.map((p, i) => (
                  <button key={p.id}
                    onClick={() => { haptic(); setSelectedIdx(i); }}
                    className="flex-shrink-0 flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl transition-all"
                    style={i === selectedIdx
                      ? { background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.5)' }
                      : { background: 'var(--ink-040)', border: '1px solid var(--ink-060)' }}>
                    <p.icon size={18} style={{ color: i === selectedIdx ? '#C4B5FD' : 'var(--ink-500)' }} strokeWidth={1.7} />
                    <span className="text-xs font-medium whitespace-nowrap"
                      style={{ color: i === selectedIdx ? '#C4B5FD' : 'var(--ink-500)' }}>
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Source toggle — curated station, or search your own song */}
              <div className="flex gap-2 mb-3">
                {(['curated', 'search'] as Source[]).map(s => (
                  <button key={s}
                    onClick={() => { haptic(); setSource(s); }}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={s === source
                      ? { background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.5)', color: '#C4B5FD' }
                      : { background: 'var(--ink-040)', border: '1px solid var(--ink-060)', color: 'var(--ink-500)' }}>
                    {s === 'search' ? 'Search my songs' : 'Curated stations'}
                  </button>
                ))}
              </div>

              {/* Now Playing — real in-app playback via YouTube's embed player,
                  kept visible per YouTube's ToS (hidden/1px embeds risk API
                  suspension). Curated stations auto-play their top match. */}
              {nowPlaying && (
                <div className="mb-4 rounded-2xl overflow-hidden"
                  style={{ background: 'var(--ink-040)', border: '1px solid rgba(124,58,237,0.25)' }}>
                  <iframe
                    key={nowPlaying.videoId}
                    ref={playerRef}
                    className="w-full"
                    style={{ height: 160, border: 'none' }}
                    src={`https://www.youtube.com/embed/${nowPlaying.videoId}?autoplay=1&enablejsapi=1&playsinline=1&modestbranding=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
                    allow="autoplay; encrypted-media"
                    title={nowPlaying.title}
                  />
                  <div className="px-3 py-2">
                    <p className="text-xs font-semibold text-white truncate">{nowPlaying.title}</p>
                    <p className="text-xs text-white/40 truncate">{nowPlaying.channelTitle}</p>
                  </div>
                </div>
              )}

              {/* Curated station (auto-plays top match) or free song search —
                  both use the YouTube Data API search + the in-app player above. */}
              <div className="mb-5">
                {source === 'search'
                  ? <YouTubeSearchPanel onSelectTrack={selectTrack} activeVideoId={nowPlaying?.videoId ?? null} />
                  : <YouTubeSearchPanel initialQuery={playlist.ytQuery} hideInput onSelectTrack={selectTrack} activeVideoId={nowPlaying?.videoId ?? null} />}
              </div>

              {/* Timer controls */}
              <AnimatePresence mode="wait">
                {ended ? (
                  <motion.div key="ended" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl p-4 text-center"
                    style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                    <p className="font-heading font-bold text-white mb-1">Break over</p>
                    <p className="text-sm mb-3" style={{ color: 'var(--ink-550)' }}>
                      Time to get back to studying. You've got this.
                    </p>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={onClose}
                      className="w-full h-11 rounded-xl font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
                      Back to studying →
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div key="controls" className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedIdx(i => (i + 1) % PLAYLISTS.length)}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--ink-060)' }}>
                        <SkipForward size={16} className="text-white" />
                      </button>
                    </div>

                    <motion.button whileTap={{ scale: 0.92 }} onClick={togglePlay}
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', boxShadow: '0 0 24px rgba(124,58,237,0.4)' }}>
                      {playing
                        ? <Pause size={22} className="text-white" fill="white" />
                        : <Play  size={22} className="text-white" fill="white" style={{ marginLeft: 2 }} />}
                    </motion.button>

                    <div className="flex items-center gap-2">
                      {locked && <Lock size={11} style={{ color: 'var(--ink-400)' }} />}
                      <span className="text-xs" style={{ color: 'var(--ink-400)' }}>
                        {durationMin}min break
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
