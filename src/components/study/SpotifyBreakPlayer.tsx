import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Music, Play, Pause, SkipForward, Clock } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Break duration in minutes (10 or 15) */
  breakMin?: 10 | 15;
}

// Curated Spotify embed playlists (no auth needed, public embeds)
const PLAYLISTS = [
  { id: 'lofi',    label: 'Lo-fi Beats',     emoji: '🎵', spotifyId: '37i9dQZF1DWWQRwui0ExPn' },
  { id: 'rain',    label: 'Rain & Thunder',  emoji: '🌧️', spotifyId: '37i9dQZF1DX4aYNO8X5RpR' },
  { id: 'cafe',    label: 'Café Ambience',   emoji: '☕', spotifyId: '37i9dQZF1DXbvABJXBIyiY' },
  { id: 'brown',   label: 'Brown Noise',     emoji: '🌊', spotifyId: '37i9dQZF1DWUZ5bk6qqDSy' },
  { id: 'classical',label: 'Focus Classical', emoji: '🎻', spotifyId: '37i9dQZF1DWV0gynK7G6pD' },
];

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function SpotifyBreakPlayer({ open, onClose, breakMin = 10 }: Props) {
  const totalSecs = breakMin * 60;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [playing, setPlaying]         = useState(false);
  const [remaining, setRemaining]     = useState(totalSecs);
  const [ended, setEnded]             = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) { setRemaining(totalSecs); setPlaying(false); setEnded(false); }
  }, [open, totalSecs]);

  // Countdown — only ticks when playing
  useEffect(() => {
    if (!playing || remaining <= 0) return;
    const t = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { setEnded(true); setPlaying(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, remaining]);

  async function haptic() {
    if (Capacitor.isNativePlatform()) await Haptics.impact({ style: ImpactStyle.Light });
  }

  function togglePlay() { haptic(); setPlaying(p => !p); }

  const playlist = PLAYLISTS[selectedIdx];
  const progress = 1 - remaining / totalSecs;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[700] flex items-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />

          <motion.div className="relative w-full rounded-t-[32px] overflow-hidden"
            style={{ background: '#0D0A1A', borderTop: '1px solid rgba(124,58,237,0.3)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}>

            {/* Progress bar */}
            <div className="absolute top-0 left-0 h-0.5 transition-all duration-1000"
              style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, #7C3AED, #A855F7)' }} />

            <div className="px-5 pt-5 pb-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
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
                  <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <X size={14} className="text-white" />
                  </button>
                </div>
              </div>

              {/* Playlist selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-5">
                {PLAYLISTS.map((p, i) => (
                  <button key={p.id}
                    onClick={() => { haptic(); setSelectedIdx(i); }}
                    className="flex-shrink-0 flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl transition-all"
                    style={i === selectedIdx
                      ? { background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.5)' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-xl">{p.emoji}</span>
                    <span className="text-xs font-medium whitespace-nowrap"
                      style={{ color: i === selectedIdx ? '#C4B5FD' : 'rgba(255,255,255,0.5)' }}>
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Spotify embed */}
              <div className="rounded-2xl overflow-hidden mb-5" style={{ height: 152 }}>
                <iframe
                  ref={iframeRef}
                  key={playlist.spotifyId}
                  src={`https://open.spotify.com/embed/playlist/${playlist.spotifyId}?utm_source=generator&theme=0`}
                  width="100%" height="152" frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  title={playlist.label}
                />
              </div>

              {/* Timer controls */}
              <AnimatePresence mode="wait">
                {ended ? (
                  <motion.div key="ended" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl p-4 text-center"
                    style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                    <p className="font-heading font-bold text-white mb-1">Break over!</p>
                    <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      Time to get back to studying. You've got this! 💪
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
                        style={{ background: 'rgba(255,255,255,0.06)' }}>
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
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {breakMin}min break
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
