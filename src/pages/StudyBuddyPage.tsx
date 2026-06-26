// ═══════════════════════════════════════════════════════════════════════════
// StudyBuddyPage — AI-matched accountability partner with daily check-ins
// Route: /study-buddy
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Sparkles, Flame, Check, Clock, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

interface BuddyPair {
  id: string;
  buddy_id: string;
  buddy_name: string;
  buddy_avatar: string | null;
  pair_streak: number;
  last_both_studied: string | null;
  my_checked_in_today: boolean;
  buddy_checked_in_today: boolean;
}

function Avatar({ url, name, size = 64 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{initials}</div>
  );
}

export default function StudyBuddyPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [pair, setPair]         = useState<BuddyPair | null>(null);
  const [loading, setLoading]   = useState(true);
  const [matching, setMatching] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [bonusToast, setBonusToast] = useState(false);

  useEffect(() => { loadBuddy(); }, [profile?.id]);

  async function loadBuddy() {
    if (!profile) return;
    setLoading(true);

    const { data: sb } = await supabase
      .from('study_buddies')
      .select('id, user_id, buddy_id, pair_streak, last_both_studied')
      .or(`user_id.eq.${profile.id},buddy_id.eq.${profile.id}`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (!sb) { setPair(null); setLoading(false); return; }

    const otherId = sb.user_id === profile.id ? sb.buddy_id : sb.user_id;
    const { data: otherProfile } = await supabase
      .from('profiles').select('full_name, avatar_url').eq('id', otherId).single();

    const today = new Date().toISOString().slice(0, 10);
    const { data: checkins } = await supabase
      .from('buddy_checkins')
      .select('user_id')
      .eq('buddy_pair_id', sb.id)
      .eq('checkin_date', today);

    const checkedIds = new Set((checkins ?? []).map(c => c.user_id));

    setPair({
      id: sb.id, buddy_id: otherId,
      buddy_name: otherProfile?.full_name ?? 'Study Buddy',
      buddy_avatar: otherProfile?.avatar_url ?? null,
      pair_streak: sb.pair_streak ?? 0,
      last_both_studied: sb.last_both_studied,
      my_checked_in_today: checkedIds.has(profile.id),
      buddy_checked_in_today: checkedIds.has(otherId),
    });
    setLoading(false);
  }

  async function findBuddy() {
    setMatching(true);
    try {
      const { data, error } = await supabase.rpc('match_study_buddy');
      if (error) throw error;
      if (data) {
        track('study_buddy_matched', {});
        await loadBuddy();
      } else {
        setBonusToast(false);
      }
    } finally {
      setMatching(false);
    }
  }

  async function checkIn() {
    if (!pair) return;
    setCheckingIn(true);
    try {
      const { data } = await supabase.rpc('buddy_checkin', { p_pair_id: pair.id });
      if (data?.both_studied) {
        setBonusToast(true);
        setTimeout(() => setBonusToast(false), 3000);
      }
      track('buddy_checkin', { both_studied: !!data?.both_studied });
      await loadBuddy();
    } finally {
      setCheckingIn(false);
    }
  }

  const cfg = { gradient: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button aria-label="Go back" onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-heading text-lg font-bold text-white flex-1">Study Buddy</h1>
      </div>

      <div className="flex-1 px-5 pb-nav overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
        ) : !pair ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl" style={{ background: 'rgba(91,106,245,0.12)' }}>🤝</div>
            <div>
              <h2 className="font-heading text-xl font-bold text-white mb-2">Get an Accountability Partner</h2>
              <p className="text-sm text-white/60 leading-relaxed max-w-xs mx-auto">
                Novo matches you with a study buddy preparing for the same exam. Check in together daily and earn bonus XP when you both study.
              </p>
            </div>
            <Button onClick={findBuddy} disabled={matching} className="mt-2 px-6" style={{ background: cfg.gradient }}>
              {matching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
              {matching ? 'Matching...' : 'Find My Study Buddy'}
            </Button>
          </div>
        ) : (
          <div className="pt-2">
            {/* Pair card */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl p-6 text-center mb-5"
              style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-center gap-3 mb-4">
                <Avatar url={profile?.avatar_url ?? null} name={profile?.full_name ?? 'You'} />
                <div className="text-2xl">🤝</div>
                <Avatar url={pair.buddy_avatar} name={pair.buddy_name} />
              </div>
              <p className="text-sm text-white/60 mb-1">You & {pair.buddy_name}</p>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <Flame className="w-5 h-5" style={{ color: '#FB923C' }} />
                <span className="font-heading text-2xl font-bold text-white">{pair.pair_streak}</span>
                <span className="text-sm text-white/50">day pair streak</span>
              </div>
            </motion.div>

            {/* Today's check-in status */}
            <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Today's Check-in</p>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-sm text-white/80">You</span>
                {pair.my_checked_in_today
                  ? <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#34D399' }}><Check className="w-3.5 h-3.5" />Studied</span>
                  : <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}><Clock className="w-3.5 h-3.5" />Pending</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">{pair.buddy_name}</span>
                {pair.buddy_checked_in_today
                  ? <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#34D399' }}><Check className="w-3.5 h-3.5" />Studied</span>
                  : <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}><Clock className="w-3.5 h-3.5" />Waiting</span>}
              </div>
            </div>

            {!pair.my_checked_in_today ? (
              <Button onClick={checkIn} disabled={checkingIn} className="w-full" style={{ background: cfg.gradient }}>
                {checkingIn ? 'Checking in...' : "I Studied Today ✓"}
              </Button>
            ) : (
              <div className="text-center py-3 rounded-2xl text-sm font-semibold" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399' }}>
                ✓ You've checked in today!
              </div>
            )}

            <p className="text-center text-xs text-white/30 mt-4 leading-relaxed">
              Both you and {pair.buddy_name} get +50 bonus XP when you both check in on the same day. Accountability partners double completion rates.
            </p>
          </div>
        )}
      </div>

      {bonusToast && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-5 rounded-3xl text-center z-50"
          style={{ background: 'rgba(20,25,50,0.97)', border: '1px solid rgba(91,106,245,0.4)' }}>
          <div className="text-4xl mb-2">🎉</div>
          <p className="font-heading text-lg font-bold text-white">+50 XP Bonus!</p>
          <p className="text-sm text-white/60 mt-1">You both studied today</p>
        </motion.div>
      )}
    </div>
  );
}
