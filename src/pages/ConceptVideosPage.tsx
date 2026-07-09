import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ChevronLeft, Play, Search, BookOpen, Zap, X, Lock} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { getLangInstruction } from '@/lib/language';
import { track } from '@/lib/analytics';

interface ConceptVideo {
  id: string;
  concept: string;
  subject: string;
  class_num: number | null;
  chapter: string | null;
  title: string;
  youtube_id: string | null;
  duration_secs: number | null;
  thumbnail_url: string | null;
  description: string | null;
  is_pro_content: boolean;
  view_count: number;
}

interface GeneratedVideoRec {
  concept: string;
  title: string;
  youtube_search: string;
  why_watch: string;
}

const SUBJECT_COLORS: Record<string, string> = {
  Physics: '#60A5FA',
  Chemistry: '#34D399',
  Maths: '#A78BFA',
  Biology: '#4ADE80',
  History: '#FBBF24',
  Geography: '#FB923C',
  Science: '#38BDF8' };

function subjectColor(s: string) { return SUBJECT_COLORS[s] ?? '#A0AEFF'; }

function formatDuration(secs: number | null) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ConceptVideosPage() {
  const { profile } = useAuth();
  const [search, setSearch]       = useState('');
  const [subject, setSubject]     = useState('');
  const [videos, setVideos]       = useState<ConceptVideo[]>([]);
  const [recommendations, setRecs] = useState<GeneratedVideoRec[]>([]);
  const [loading, setLoading]     = useState(false);
  const [_recsLoading, setRecsLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState<ConceptVideo | null>(null);
  const [watchPct, setWatchPct]   = useState(0);

  const isPro = profile?.is_pro ?? false;

  useEffect(() => {
    loadVideos();
    loadWeaknessRecs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (subject || search) loadVideos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, search]);

  async function loadVideos() {
    setLoading(true);
    let query = supabase.from('concept_videos').select('*').limit(30);
    if (subject) query = query.eq('subject', subject);
    if (search)  query = query.ilike('concept', `%${search}%`);
    const { data } = await query.order('view_count', { ascending: false });
    setVideos((data ?? []) as ConceptVideo[]);
    setLoading(false);
  }

  async function loadWeaknessRecs() {
    if (!profile) return;
    setRecsLoading(true);
    // Get user's top weaknesses
    const { data: weaknesses } = await supabase
      .from('novo_memories')
      .select('topic, content')
      .eq('user_id', profile.id)
      .eq('memory_type', 'struggle')
      .order('importance', { ascending: false })
      .limit(3);

    if (!weaknesses?.length) { setRecsLoading(false); return; }

    const langInstr = getLangInstruction(profile.preferred_language);
    const topics = weaknesses.map(w => w.topic || w.content?.slice(0, 40)).filter(Boolean).join(', ');
    try {
      const recs = await geminiJSON<GeneratedVideoRec[]>(
        `A student struggles with: ${topics}.
Recommend 3 short YouTube video topics (60-90 seconds) that would help them understand these concepts.${langInstr}
Return ONLY JSON array: [{"concept":"...","title":"...","youtube_search":"...","why_watch":"..."}]`
      );
      setRecs(recs ?? []);
    } catch { /* silent */ }
    setRecsLoading(false);
  }

  async function openVideo(video: ConceptVideo) {
    if (video.is_pro_content && !isPro) return;
    setActiveVideo(video);
    setWatchPct(0);
    track('concept_video_opened', { concept: video.concept, subject: video.subject });
    // Increment view count
    await supabase.from('concept_videos').update({ view_count: (video.view_count ?? 0) + 1 }).eq('id', video.id);
  }

  async function closeVideo() {
    if (activeVideo && profile) {
      await supabase.from('video_watches').upsert({
        user_id: profile.id, video_id: activeVideo.id, watch_pct: watchPct, watched_at: new Date().toISOString() }, { onConflict: 'user_id,video_id' });
    }
    setActiveVideo(null);
  }

  const SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology', 'History', 'Geography', 'Science'];

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3 shrink-0"
           style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Link aria-label="Go back" to="/tools">
          <motion.button whileTap={{ scale: 0.92 }} className="p-2 rounded-xl"
            style={{ background: 'var(--color-surface)' }}>
            <ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} />
          </motion.button>
        </Link>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Concept Videos</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>60-sec explainers for hard topics</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-nav px-4 py-4 space-y-5">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl"
             style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search concept…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)' }} />
        </div>

        {/* Subject filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SUBJECTS.map(s => (
            <button key={s} onClick={() => setSubject(subject === s ? '' : s)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 transition-all"
              style={{
                background: subject === s ? `${subjectColor(s)}20` : 'var(--color-surface)',
                color: subject === s ? subjectColor(s) : 'var(--color-text-secondary)',
                border: `1px solid ${subject === s ? subjectColor(s) : 'var(--color-border)'}` }}>
              {s}
            </button>
          ))}
        </div>

        {/* Weakness-based recommendations */}
        {recommendations.length > 0 && !search && !subject && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
               style={{ color: 'var(--color-text-secondary)' }}>
              <Zap size={12} color="#FBBF24" /> Novo recommends for your weak topics
            </p>
            {recommendations.map((rec, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="p-4 rounded-2xl flex items-center gap-3"
                style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.25)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: 'rgba(91,106,245,0.2)' }}>
                  <Play size={18} color="#A0AEFF" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{rec.title}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {rec.concept} · {rec.why_watch}
                  </p>
                </div>
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(rec.youtube_search + ' explained')}`}
                   target="_blank" rel="noopener noreferrer"
                   onClick={() => track('concept_video_rec_clicked', { concept: rec.concept })}>
                  <Button className="text-xs px-3 py-1.5 rounded-xl h-auto"
                    style={{ background: '#FF0000', color: 'var(--ink-950)' }}>YouTube</Button>
                </a>
              </motion.div>
            ))}
          </div>
        )}

        {/* Video grid */}
        {loading ? (
          <div className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
            Loading videos…
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <BookOpen size={40} className="mx-auto opacity-30" style={{ color: 'var(--color-text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              No videos yet — content is being added.
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Use YouTube search above for instant access.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider"
               style={{ color: 'var(--color-text-secondary)' }}>
              {videos.length} videos available
            </p>
            {videos.map((v, i) => (
              <motion.div key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => openVideo(v)}
                className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all hover:opacity-90"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {/* Thumbnail */}
                <div className="w-20 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden relative"
                     style={{ background: `${subjectColor(v.subject)}20` }}>
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
                  ) : (
                    <Play size={20} color={subjectColor(v.subject)} />
                  )}
                  {v.duration_secs && (
                    <span className="absolute bottom-1 right-1 text-xs font-bold px-1 rounded"
                      style={{ background: 'rgba(0,0,0,0.7)', color: 'var(--ink-950)' }}>
                      {formatDuration(v.duration_secs)}
                    </span>
                  )}
                  {v.is_pro_content && !isPro && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl"
                         style={{ background: 'rgba(0,0,0,0.5)' }}>
                      <Lock size={14} color="#fff" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
                    {v.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: subjectColor(v.subject) }}>{v.subject}</p>
                  {v.description && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {v.description}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Video player overlay */}
      <AnimatePresence>
        {activeVideo && (
          <motion.div key="player" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: '#000' }}>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold text-white truncate flex-1">{activeVideo.title}</p>
              <button onClick={closeVideo} className="p-2 rounded-xl ml-2"
                style={{ background: 'var(--ink-100)' }}>
                <X size={20} color="#fff" />
              </button>
            </div>
            {activeVideo.youtube_id ? (
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${activeVideo.youtube_id}?autoplay=1&rel=0`}
                  title={activeVideo.title}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-white text-sm opacity-60">Video unavailable</p>
              </div>
            )}
            <div className="px-4 py-4 space-y-2">
              <p className="text-white text-sm font-semibold">{activeVideo.concept}</p>
              {activeVideo.description && (
                <p className="text-sm opacity-70 text-white">{activeVideo.description}</p>
              )}
              {/* Watch % slider */}
              <div className="space-y-1 pt-2">
                <p className="text-xs text-white opacity-50">How much did you watch?</p>
                <input type="range" min={0} max={100} value={watchPct}
                  onChange={e => setWatchPct(Number(e.target.value))}
                  className="w-full" />
                <p className="text-xs text-white opacity-50 text-right">{watchPct}%</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
