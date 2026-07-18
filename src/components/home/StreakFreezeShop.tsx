import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import { Snowflake, X, ShoppingBag, CheckCircle2, Zap, Shield, Gift, Search, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
  freezeCount: number;
  onPurchased: (newCount: number) => void;
}

type PurchaseState = 'idle' | 'purchasing' | 'success' | 'error';
type GiftState = 'idle' | 'searching' | 'gifting' | 'success' | 'error';

interface FriendResult {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const PLANS = [
  {
    id: 'single',
    label: '1 Freeze',
    subLabel: 'One-time safety net',
    price: 29,
    quantity: 1,
    icon: Snowflake,
    gradient: 'linear-gradient(135deg,#0EA5E9,#38BDF8)',
    glow: 'rgba(14,165,233,0.35)',
  },
  {
    id: 'bundle',
    label: '5 Freezes',
    subLabel: 'Best value · ₹20 each',
    price: 99,
    quantity: 5,
    icon: Shield,
    gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
    glow: 'rgba(99,102,241,0.4)',
    badge: 'Save 31%',
  },
] as const;

const MILESTONES = [
  { days: 7,  reward: 1, label: '7-day streak' },
  { days: 30, reward: 2, label: '30-day streak' },
  { days: 90, reward: 3, label: '90-day streak' },
];

export function StreakFreezeShop({ open, onClose, freezeCount, onPurchased }: Props) {
  const { user, profile } = useAuth();
  const [state, setState]     = useState<PurchaseState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const streak = profile?.streak_count ?? 0;

  const [giftSearch, setGiftSearch]     = useState('');
  const [giftResults, setGiftResults]   = useState<FriendResult[]>([]);
  const [giftTarget, setGiftTarget]     = useState<FriendResult | null>(null);
  const [giftState, setGiftState]       = useState<GiftState>('idle');
  const [giftError, setGiftError]       = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) { setState('idle'); setErrorMsg(''); setGiftSearch(''); setGiftResults([]); setGiftTarget(null); setGiftState('idle'); setGiftError(''); }
  }, [open]);

  function handleGiftSearchChange(val: string) {
    setGiftSearch(val);
    setGiftTarget(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.trim().length < 2) { setGiftResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setGiftState('searching');
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .ilike('full_name', `%${val.trim()}%`)
        .neq('id', user?.id ?? '')
        .limit(5);
      setGiftResults((data as FriendResult[]) ?? []);
      setGiftState('idle');
    }, 400);
  }

  async function handleGift() {
    if (!user || !giftTarget) return;
    setGiftState('gifting');
    setGiftError('');
    const { data } = await supabase.rpc('gift_streak_freeze', {
      p_from_user_id: user.id,
      p_to_user_id: giftTarget.id,
    });
    const result = data as { error?: string; success?: boolean };
    if (result?.error) {
      setGiftError(result.error);
      setGiftState('error');
    } else {
      setGiftState('success');
      setGiftTarget(null);
      setGiftSearch('');
      setGiftResults([]);
    }
  }

  async function handlePurchase(plan: typeof PLANS[number]) {
    if (!user || state === 'purchasing') return;
    setState('purchasing');
    setErrorMsg('');
    try {
      const { error } = await supabase.rpc('add_streak_freeze', {
        p_user_id: user.id,
        p_quantity: plan.quantity,
        p_source: `iap_${plan.id}`,
        p_amount_paise: plan.price * 100,
      });
      if (error) throw error;
      onPurchased(Math.min(10, freezeCount + plan.quantity));
      setState('success');
    } catch {
      setState('error');
      setErrorMsg('Purchase failed. Please try again.');
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring.smooth}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg,var(--grad-fab-1) 0%,var(--grad-fab-2) 100%)',
              border: '1px solid var(--ink-060)',
              borderBottom: 'none',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--ink-150)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <Snowflake size={18} style={{ color: '#38BDF8', filter: 'drop-shadow(0 0 6px rgba(56,189,248,0.7))' }} />
                <h2 className="font-heading text-lg font-extrabold text-white">Streak Freezes</h2>
              </div>
              <button
                aria-label="Close"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-080)' }}
              >
                <X size={14} className="text-white/50" />
              </button>
            </div>

            <div className="px-5 pb-6 flex flex-col gap-5">
              {/* Current balance */}
              <div
                className="flex items-center justify-between px-4 py-3.5 rounded-2xl"
                style={{
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.15)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Snowflake size={16} style={{ color: '#38BDF8' }} />
                  <span className="text-sm font-bold text-white">Current freezes</span>
                </div>
                <span className="font-heading text-2xl font-extrabold" style={{ color: '#38BDF8' }}>
                  {freezeCount}
                  <span className="text-base text-white/30 font-semibold">/10</span>
                </span>
              </div>

              {/* Success message */}
              <AnimatePresence>
                {state === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}
                  >
                    <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                    <p className="text-sm text-emerald-300 font-semibold">Freeze added to your account!</p>
                  </motion.div>
                )}
                {state === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-4 py-3 rounded-2xl"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <p className="text-sm text-red-300">{errorMsg}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Purchase plans */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/35 mb-3">Buy Freezes</p>
                <div className="flex flex-col gap-2.5">
                  {PLANS.map((plan) => {
                    const Icon = plan.icon;
                    return (
                      <motion.button
                        key={plan.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handlePurchase(plan)}
                        disabled={state === 'purchasing' || freezeCount >= 10}
                        className="flex items-center gap-3 p-4 rounded-2xl text-left disabled:opacity-50"
                        style={{
                          background: 'var(--ink-040)',
                          border: '1px solid var(--ink-070)',
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: plan.gradient, boxShadow: `0 4px 14px ${plan.glow}` }}
                        >
                          <Icon size={18} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{plan.label}</span>
                            {'badge' in plan && plan.badge && (
                              <span
                                className="px-1.5 py-0.5 rounded-full text-xs font-extrabold uppercase"
                                style={{ background: 'rgba(234,179,8,0.15)', color: '#EAB308' }}
                              >
                                {plan.badge}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-white/40">{plan.subLabel}</span>
                        </div>
                        <div className="shrink-0">
                          {state === 'purchasing' ? (
                            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                          ) : (
                            <div
                              className="px-3 py-1.5 rounded-xl text-sm font-extrabold"
                              style={{ background: plan.gradient, color: 'var(--ink-950)' }}
                            >
                              ₹{plan.price}
                            </div>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Earn milestones */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/35 mb-3">Earn for Free</p>
                <div className="flex flex-col gap-2">
                  {MILESTONES.map(({ days, reward, label }) => {
                    const unlocked = streak >= days;
                    return (
                      <div
                        key={days}
                        className="flex items-center justify-between px-4 py-3 rounded-2xl"
                        style={{
                          background: unlocked ? 'rgba(234,179,8,0.08)' : 'var(--ink-030)',
                          border: `1px solid ${unlocked ? 'rgba(234,179,8,0.18)' : 'var(--ink-050)'}`,
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <Zap size={14} style={{ color: unlocked ? '#EAB308' : 'var(--ink-200)' }} />
                          <div>
                            <p className={`text-sm font-semibold ${unlocked ? 'text-white' : 'text-white/30'}`}>{label}</p>
                            <p className="text-xs text-white/25">+{reward} freeze{reward > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        {unlocked && <CheckCircle2 size={14} style={{ color: '#EAB308' }} />}
                        {!unlocked && (
                          <span className="text-xs text-white/25 font-semibold">{days - streak}d away</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gift a Freeze */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/35 mb-3">Gift a Freeze</p>
                <div className="flex flex-col gap-2.5 p-4 rounded-2xl" style={{ background: 'var(--ink-030)', border: '1px solid var(--ink-070)' }}>
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Gift size={13} style={{ color: '#A78BFA' }} />
                    <span>Costs <strong className="text-violet-300">100 XP</strong> · adds 1 freeze to a friend</span>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                    <input
                      value={giftSearch}
                      onChange={e => handleGiftSearchChange(e.target.value)}
                      placeholder="Search friend by name…"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/25 outline-none"
                      style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
                    />
                    {giftState === 'searching' && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 animate-spin" />}
                  </div>

                  {/* Results */}
                  <AnimatePresence>
                    {giftResults.length > 0 && !giftTarget && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-1">
                        {giftResults.map(f => (
                          <button
                            key={f.id}
                            onClick={() => { setGiftTarget(f); setGiftResults([]); }}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors hover:bg-white/5"
                            style={{ background: 'var(--ink-030)', border: '1px solid var(--ink-060)' }}
                          >
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}>
                              {(f.full_name ?? '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-white/80 font-medium">{f.full_name ?? 'Unknown'}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Selected target + confirm */}
                  <AnimatePresence>
                    {giftTarget && giftState !== 'success' && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                          <Gift size={13} style={{ color: '#A78BFA' }} />
                          <span className="text-sm text-violet-200 font-medium truncate">{giftTarget.full_name}</span>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleGift}
                          disabled={giftState === 'gifting'}
                          className="px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}
                        >
                          {giftState === 'gifting' ? <Loader2 size={14} className="animate-spin" /> : 'Gift'}
                        </motion.button>
                        <button aria-label="Close" onClick={() => setGiftTarget(null)} className="p-2 rounded-xl text-white/30 hover:text-white/60">
                          <X size={14} />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Gift feedback */}
                  <AnimatePresence>
                    {giftState === 'success' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <CheckCircle2 size={14} style={{ color: '#10B981' }} />
                        <span className="text-xs text-emerald-300 font-semibold">Freeze gifted! 100 XP spent.</span>
                      </motion.div>
                    )}
                    {giftState === 'error' && giftError && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <span className="text-xs text-red-300">{giftError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2">
                <ShoppingBag size={12} className="text-white/25 mt-0.5 shrink-0" />
                <p className="text-xs text-white/25 leading-relaxed">
                  Freezes are applied automatically when you miss a day. Max 10 stored. Non-refundable.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
