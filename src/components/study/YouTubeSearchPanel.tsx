import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, ExternalLink, Play } from 'lucide-react';
import { searchYouTubeTracks, type YouTubeTrack } from '@/lib/youtubeSearch';
import { track } from '@/lib/analytics';

interface Props {
  /** Pre-filled query for curated stations (e.g. "lofi hip hop radio").
   *  When set, the panel auto-searches on mount/change instead of waiting
   *  for user input — used to replace the unreliable YouTube iframe embed
   *  (Google increasingly blocks listType=search embeds inside WebViews). */
  initialQuery?: string;
  /** Hides the free-text search box — used for curated-station mode where
   *  only the preset query should be searched. */
  hideInput?: boolean;
  /** Called when the student picks a track. When provided, playback stays
   *  in-app (parent renders the embedded player) instead of leaving Edora. */
  onSelectTrack?: (t: YouTubeTrack) => void;
  /** videoId of the track currently playing — highlights it in the list. */
  activeVideoId?: string | null;
}

// Search any song and play it in-app via the embedded player passed up to
// the parent — free for every user, no login, no premium gate, no
// developer-mode allowlist cap. Just a server-side API key search.
export function YouTubeSearchPanel({ initialQuery, hideInput = false, onSelectTrack, activeVideoId }: Props) {
  const [query, setQuery]       = useState(initialQuery ?? '');
  const [results, setResults]   = useState<YouTubeTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayedQueryRef = useRef<string | null>(null);

  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const tracks = await searchYouTubeTracks(q);
      setResults(tracks);
      setSearching(false);
      // Curated-station mode auto-plays the top hit — no tap required, so
      // switching a station feels instant instead of dumping a result list.
      if (initialQuery && hideInput && tracks[0] && autoPlayedQueryRef.current !== q) {
        autoPlayedQueryRef.current = q;
        onSelectTrack?.(tracks[0]);
      }
    }, 400);
  }, [initialQuery, hideInput, onSelectTrack]);

  // Curated-station mode: auto-run whenever the preset query changes
  // (e.g. user switches playlist chips) instead of waiting for typed input.
  useEffect(() => {
    if (initialQuery) runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function openTrack(t: YouTubeTrack) {
    track('youtube_search_track_opened', { video_id: t.videoId });
    if (onSelectTrack) { onSelectTrack(t); return; }
    window.location.href = `https://www.youtube.com/watch?v=${t.videoId}`;
  }

  return (
    <div className="flex flex-col gap-2">
      {!hideInput && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
          <Search size={14} className="text-white/40" />
          <input
            value={query}
            onChange={e => runSearch(e.target.value)}
            placeholder="Search any song or artist..."
            className="flex-1 bg-transparent text-white placeholder:text-white/30 text-sm outline-none"
          />
        </div>
      )}

      {searching && <p className="text-xs text-white/40 text-center py-2">Loading…</p>}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
          {results.map(t => {
            const active = t.videoId === activeVideoId;
            return (
              <button key={t.videoId} onClick={() => openTrack(t)}
                className="flex items-center gap-3 p-2 rounded-xl text-left"
                style={active
                  ? { background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.4)' }
                  : { background: 'var(--ink-040)', border: '1px solid transparent' }}>
                {t.thumbnail && <img src={t.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: active ? '#C4B5FD' : 'white' }}>{t.title}</p>
                  <p className="text-xs text-white/40 truncate">{t.channelTitle}</p>
                </div>
                {active
                  ? <span className="text-xs font-bold shrink-0" style={{ color: '#C4B5FD' }}>▶ Playing</span>
                  : onSelectTrack
                    ? <Play size={13} className="text-white/30 shrink-0" />
                    : <ExternalLink size={13} className="text-white/30 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
