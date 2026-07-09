// ═══════════════════════════════════════════════════════════════════════════
// AchievementFeedPage — Social activity feed with emoji reactions,
//                       shareable cards, school toppers
// Route: /feed
// ═══════════════════════════════════════════════════════════════════════════

import {useState, useEffect, useRef} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ChevronLeft, Flame, Trophy, Zap, BookOpen, Users,
  Star, Award, RefreshCw, Share2,
  GraduationCap, CheckCircle2, Target} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { EmptyState } from '@/components/ui/EmptyState';
import { Megaphone } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  subtitle: string | null;
  emoji: string;
  reaction_count: number;
  is_public: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
  profile?: {
    full_name: string;
    avatar_url: string | null;
    school_name: string | null;
  };
  my_reaction?: string | null;
}

const EVENT_COLORS: Record<string, string> = {
  chapter_completed: '#10B981',
  quiz_aced:         '#60A5FA',
  streak_milestone:  '#F59E0B',
  level_up:          '#A78BFA',
  battle_won:        '#EF4444',
  circle_joined:     '#34D399',
  mock_test:         '#F472B6',
  pyq_session:       '#FB923C',
  achievement_unlocked: '#FBBF24' };

const EVENT_ICONS: Record<string, React.ReactNode> = {
  chapter_completed: <BookOpen size={16} />,
  quiz_aced:         <CheckCircle2 size={16} />,
  streak_milestone:  <Flame size={16} />,
  level_up:          <Zap size={16} />,
  battle_won:        <Trophy size={16} />,
  circle_joined:     <Users size={16} />,
  mock_test:         <GraduationCap size={16} />,
  pyq_session:       <Target size={16} />,
  achievement_unlocked: <Award size={16} /> };

const REACTION_EMOJIS = ['👏', '🔥', '🎉', '💪', '⭐', '🚀'];

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ url, name, size = 40 }: { url: string | null | undefined; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (url && !imgError) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={() => setImgError(true)} />;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: 'var(--ink-950)' }}>{initials}</div>
  );
}

// ── Time ago ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Feed Card ─────────────────────────────────────────────────────────────────
function FeedCard({ item, myId, onReact, onShare }: {
  item: FeedItem;
  myId: string;
  onReact: (id: string, emoji: string) => void;
  onShare: (item: FeedItem) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const color = EVENT_COLORS[item.event_type] ?? '#60A5FA';
  const isOwn = item.user_id === myId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--color-surface)',
        borderRadius: 16,
        border: '1px solid var(--color-border)',
        overflow: 'hidden' }}
    >
      {/* Color accent top bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg,${color},transparent)` }} />

      <div style={{ padding: '14px 16px' }}>
        {/* User + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Avatar url={item.profile?.avatar_url} name={item.profile?.full_name ?? 'User'} size={38} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{item.profile?.full_name ?? 'Student'}</div>
            {item.profile?.school_name && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{item.profile.school_name}</div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{timeAgo(item.created_at)}</div>
        </div>

        {/* Event content */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22 }}>
            {item.emoji}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{item.title}</div>
            {item.subtitle && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{item.subtitle}</div>}
          </div>
        </div>

        {/* Event type badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
            background: `${color}22`, color, fontSize: 12, fontWeight: 600 }}>
            <span style={{ color }}>{EVENT_ICONS[item.event_type]}</span>
            {item.event_type.replace(/_/g, ' ')}
          </div>
        </div>

        {/* Reaction bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowReactions(s => !s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 20,
                border: `1px solid ${item.my_reaction ? color : 'var(--color-border)'}`,
                background: item.my_reaction ? `${color}22` : 'transparent',
                color: item.my_reaction ? color : 'var(--color-text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              {item.my_reaction ?? '👏'} {item.reaction_count}
            </button>
          </div>
          {!isOwn && (
            <button onClick={() => onShare(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <Share2 size={14} />
            </button>
          )}
        </div>

        {/* Emoji picker */}
        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -10 }}
              style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}
            >
              {REACTION_EMOJIS.map(e => (
                <motion.button
                  key={e}
                  whileTap={{ scale: 1.3 }}
                  onClick={() => { onReact(item.id, e); setShowReactions(false); }}
                  style={{
                    fontSize: 22, padding: '6px 10px', borderRadius: 10,
                    border: item.my_reaction === e ? `2px solid ${color}` : '2px solid var(--color-border)',
                    background: 'var(--color-bg)', cursor: 'pointer' }}
                >{e}</motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── School Toppers Banner ─────────────────────────────────────────────────────
function SchoolToppersBanner({ items }: { items: FeedItem[] }) {
  if (!items.length) return null;
  const toppers = items.filter(i => i.event_type === 'level_up' || i.event_type === 'streak_milestone').slice(0, 3);
  if (!toppers.length) return null;

  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.15),rgba(251,191,36,0.08))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '12px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontWeight: 700, fontSize: 13, color: '#F59E0B' }}>
        <Star size={15} />School Toppers This Week
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {toppers.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{ position: 'relative', marginBottom: 4 }}>
              <Avatar url={t.profile?.avatar_url} name={t.profile?.full_name ?? 'User'} size={40} />
              <div style={{
                position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff',
                background: i === 0 ? '#FBBF24' : i === 1 ? '#C0C0C0' : '#CD7F32',
              }}>{i + 1}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
              {(t.profile?.full_name ?? 'User').split(' ')[0]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AchievementFeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems]           = useState<FeedItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(true);
  const [filter, setFilter]         = useState<'all' | 'friends' | 'school'>('all');
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});

  const PAGE_SIZE = 20;
  const offsetRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    loadFeed(true);
    subscribeRealtime();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, user]);

  async function loadFeed(reset = false) {
    if (!user) return;
    if (reset) { setLoading(true); offsetRef.current = 0; }
    else setLoadingMore(true);

    const offset = reset ? 0 : offsetRef.current;

    let query = supabase
      .from('achievement_feed')
      .select('*, profiles!user_id(full_name,avatar_url,school_name)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filter === 'school') {//  by same school (need to join — simplified via profile column)
      const { data: myProfile} = await supabase.from('profiles').select('school_name').eq('id', user.id).maybeSingle();
      if (myProfile?.school_name) {
        // Can't easily filter by profile.school_name here, show all for now
      }
    }

    const { data, error } = await query;
    if (error) { setLoading(false); setLoadingMore(false); return; }

    const enriched: FeedItem[] = (data ?? []).map(item => ({
      ...item,
      profile: item.profiles as FeedItem['profile'] }));

    // Load my reactions
    if (enriched.length > 0) {
      const ids = enriched.map(i => i.id);
      const { data: reactions } = await supabase.from('feed_reactions').select('feed_id,emoji').eq('user_id', user.id).in('feed_id', ids);
      const reactionMap: Record<string, string> = {};
      (reactions ?? []).forEach(r => { reactionMap[r.feed_id] = r.emoji; });
      setMyReactions(prev => ({ ...prev, ...reactionMap }));
    }

    if (reset) setItems(enriched);
    else setItems(prev => [...prev, ...enriched]);

    setHasMore(enriched.length === PAGE_SIZE);
    offsetRef.current = offset + enriched.length;
    setLoading(false);
    setLoadingMore(false);
    track('feed_viewed', { filter });
  }

  function subscribeRealtime() {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel('achievement_feed_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'achievement_feed' }, async (payload) => {
        const newItem = payload.new as FeedItem;
        if (!newItem.is_public) return;
        const { data: p } = await supabase.from('profiles').select('full_name,avatar_url,school_name').eq('id', newItem.user_id).maybeSingle();
        setItems(prev => [{ ...newItem, profile: p as FeedItem['profile'] }, ...prev]);
      })
      .subscribe();
    channelRef.current = ch;
  }

  async function handleReact(feedId: string, emoji: string) {
    if (!user) return;
    const existing = myReactions[feedId];
    if (existing === emoji) {
      // Remove reaction
      await supabase.from('feed_reactions').delete().eq('feed_id', feedId).eq('user_id', user.id);
      setMyReactions(prev => { const n = { ...prev }; delete n[feedId]; return n; });
      setItems(prev => prev.map(i => i.id === feedId ? { ...i, reaction_count: Math.max(0, i.reaction_count - 1) } : i));
    } else {
      // Upsert reaction
      await supabase.from('feed_reactions').upsert({ feed_id: feedId, user_id: user.id, emoji });
      const delta = existing ? 0 : 1;
      setMyReactions(prev => ({ ...prev, [feedId]: emoji }));
      setItems(prev => prev.map(i => i.id === feedId ? { ...i, reaction_count: i.reaction_count + delta } : i));
    }
    track('feed_reacted', { emoji });
  }

  function handleShare(item: FeedItem) {
    const text = `${item.emoji} ${item.title} — ${item.profile?.full_name ?? 'A student'} on Edora!`;
    if (navigator.share) {
      navigator.share({ title: 'Edora Achievement', text, url: 'https://edora.app' }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    track('feed_shared', { event_type: item.event_type });
  }

  const withReactions = items.map(i => ({ ...i, my_reaction: myReactions[i.id] ?? null }));

  return (
    <div className="pb-nav" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--hdr-a-820)', backdropFilter: 'blur(48px) saturate(200%) brightness(1.04)', WebkitBackdropFilter: 'blur(48px) saturate(200%) brightness(1.04)', borderBottom: '1px solid var(--ink-080)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
          <button aria-label="Go back" onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}>
            <ChevronLeft size={24} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Achievement Feed</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Celebrate your community</div>
          </div>
          <button onClick={() => loadFeed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <RefreshCw size={18} />
          </button>
        </div>

        {/*  tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px' }}>
          {(['all', 'friends', 'school'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              border: `1px solid ${filter === f ? '#60A5FA' : 'var(--color-border)'}`,
              background: filter === f ? 'rgba(96,165,250,0.15)' : 'transparent',
              color: filter === f ? '#60A5FA' : 'var(--color-text-secondary)', cursor: 'pointer' }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 0', maxWidth: 480, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} style={{ height: 140, background: 'var(--color-surface)', borderRadius: 16, border: '1px solid var(--color-border)', animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            iconColor="#FBBF24"
            iconBg="rgba(251,191,36,0.10)"
            title="Nothing here yet"
            subtitle="Achievements and milestones from you and classmates will appear here as you study."
          />
        ) : (
          <>
            <SchoolToppersBanner items={withReactions} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {withReactions.map(item => (
                <FeedCard
                  key={item.id}
                  item={item}
                  myId={user?.id ?? ''}
                  onReact={handleReact}
                  onShare={handleShare}
                />
              ))}
            </div>
            {hasMore && (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <Button
                  variant="outline"
                  onClick={() => loadFeed(false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
