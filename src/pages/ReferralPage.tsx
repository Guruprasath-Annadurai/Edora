// ═══════════════════════════════════════════════════════════════════════════
// ReferralPage — Invite friends, earn XP, track referrals
// Route: /referral
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Gift, Copy, Check, Share2, Users, Zap, Crown, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics';

interface Referral {
  referee_id: string;
  referee_name: string;
  referee_avatar: string | null;
  status: 'signed_up' | 'study_milestone' | 'pro_converted';
  xp_awarded: number;
  created_at: string;
}

const STATUS_CONFIG = {
  signed_up:       { label: 'Joined',      color: '#A0AEFF', xp: 100 },
  study_milestone: { label: 'Active',      color: '#34D399', xp: 200 },
  pro_converted:   { label: 'Went Pro!',   color: '#FBBF24', xp: 500 },
};

function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{initials}</div>
  );
}

export default function ReferralPage() {
  const { profile } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading]     = useState(true);
  const [copied, setCopied]       = useState(false);

  const referralCode = profile?.referral_code ?? '--------';
  const referralLink = `https://edora.app/join?ref=${referralCode}`;
  const totalXP      = referrals.reduce((s, r) => s + r.xp_awarded, 0);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('my_referrals')
      .select('*')
      .eq('referrer_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setReferrals((data ?? []) as Referral[]);
        setLoading(false);
      });
    track('referral_page_viewed', { referral_code: referralCode });
  }, [profile]);

  async function copyCode() {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await Toast.show({ text: 'Code copied!', duration: 'short' });
    } catch {
      await Toast.show({ text: referralCode, duration: 'long' });
    }
    track('referral_code_copied');
  }

  async function shareLink() {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    try {
      await Share.share({
        title: 'Study smarter with Edora',
        text: `Join me on Edora — the AI study app that actually gets you better marks! Use my code ${referralCode} to get 50 bonus XP when you sign up 🚀`,
        url: referralLink,
      });
      track('referral_link_shared');
    } catch { /* cancelled */ }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'transparent' }}>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(64px)', WebkitBackdropFilter: 'blur(64px)' }}>
        <Link to="/profile" className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Invite & Earn XP</h2>
          <p className="text-xs text-white/40">Share Edora, get rewarded</p>
        </div>
        <Gift size={18} style={{ color: '#A0AEFF' }} />
      </div>

      <div className="flex-1 overflow-y-auto pb-nav px-4 pt-5 flex flex-col gap-4">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#0A0A1F,#1A0A3E)', border: '1px solid rgba(91,106,245,0.3)' }}>
          <div className="absolute inset-0 opacity-20"
            style={{ background: 'radial-gradient(ellipse at 80% 20%,#5B6AF5,transparent 60%)' }} />
          <div className="relative">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Your referral code</p>
            <div className="flex items-center gap-3 mb-4">
              <span className="font-heading text-3xl font-black text-white tracking-[0.15em]">{referralCode}</span>
              <button onClick={copyCode}
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-colors"
                style={{ background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.08)', border: `1px solid ${copied ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                <AnimatePresence mode="wait">
                  {copied
                    ? <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={16} className="text-green-400" /></motion.div>
                    : <motion.div key="copy"  initial={{ scale: 0 }} animate={{ scale: 1 }}><Copy  size={16} className="text-white/60" /></motion.div>
                  }
                </AnimatePresence>
              </button>
            </div>

            {/* Rewards */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <p className="text-xs text-white/40 mb-0.5">You earn</p>
                <p className="font-heading font-bold text-white text-lg">+100 XP</p>
                <p className="text-[10px] text-white/30">per friend who joins</p>
              </div>
              <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <p className="text-xs text-white/40 mb-0.5">Friend gets</p>
                <p className="font-heading font-bold text-white text-lg">+50 XP</p>
                <p className="text-[10px] text-white/30">bonus on signup</p>
              </div>
            </div>

            <motion.button whileTap={{ scale: 0.97 }} onClick={shareLink}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
              <Share2 size={16} /> Invite Friends
            </motion.button>
          </div>
        </motion.div>

        {/* Bonus milestones */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Bonus XP milestones</p>
          {[
            { icon: Users,       label: 'Friend signs up',            xp: '+100 XP', done: referrals.some(r => r.status !== undefined) },
            { icon: Zap,         label: 'Friend completes 10 sessions', xp: '+200 XP', done: referrals.some(r => r.status === 'study_milestone' || r.status === 'pro_converted') },
            { icon: Crown,       label: 'Friend upgrades to Pro',     xp: '+500 XP', done: referrals.some(r => r.status === 'pro_converted') },
          ].map(({ icon: Icon, label, xp, done }) => (
            <div key={label} className="flex items-center gap-3 py-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: done ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)' }}>
                {done
                  ? <CheckCircle2 size={16} className="text-green-400" />
                  : <Icon size={16} className="text-white/30" />
                }
              </div>
              <p className="flex-1 text-sm text-white/70">{label}</p>
              <span className="text-sm font-bold" style={{ color: done ? '#34D399' : '#A0AEFF' }}>{xp}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        {totalXP > 0 && (
          <div className="rounded-2xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
            <Zap size={16} style={{ color: '#A0AEFF' }} />
            <p className="text-sm text-white/70 flex-1">Total XP earned from referrals</p>
            <span className="font-heading font-bold text-white">{totalXP.toLocaleString()} XP</span>
          </div>
        )}

        {/* Referrals list */}
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
            {loading ? 'Loading…' : referrals.length === 0 ? 'No referrals yet' : `${referrals.length} Friend${referrals.length !== 1 ? 's' : ''} Invited`}
          </p>
          <div className="flex flex-col gap-2">
            {referrals.map((r, i) => {
              const cfg = STATUS_CONFIG[r.status];
              return (
                <motion.div key={r.referee_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Avatar url={r.referee_avatar} name={r.referee_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{r.referee_name}</p>
                    <p className="text-xs text-white/40">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
                    {cfg.label}
                  </span>
                  <span className="text-sm font-bold" style={{ color: '#A0AEFF' }}>+{r.xp_awarded}</span>
                </motion.div>
              );
            })}
            {!loading && referrals.length === 0 && (
              <div className="py-8 text-center">
                <Gift size={32} className="mx-auto mb-3 text-white/20" />
                <p className="text-sm text-white/40">Share your code and your friends' progress will appear here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Fine print */}
        <p className="text-center text-[10px] text-white/20 pb-4">
          XP is awarded when your friend completes the action. No limit on referrals.
        </p>
      </div>
    </div>
  );
}
