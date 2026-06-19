import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, CheckCircle2, Crown, Zap, Mic, BarChart3,
  Award, BookOpen, RefreshCw, X, AlertCircle, Shield,
  CalendarDays, GraduationCap, Sparkles, Info,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Toast } from '@capacitor/toast';
import { NovoAvatar } from '@/components/novo/NovoAvatar';
import { IAP, restorePurchases, getIAPPlatform } from '@/lib/iap';

// ── Plans ─────────────────────────────────────────────────────────────────────
// Prices shown here must match exactly what's configured in the App Store /
// Play Console. They are displayed to users BEFORE purchase as required by
// both Apple App Store Review Guidelines and Google Play Billing Policy.

const PLANS = {
  monthly: {
    id: 'monthly' as const,
    label: 'Monthly',
    price: '₹99',
    subLabel: 'per month, billed monthly',
    paise: 9900,
    badge: null as string | null,
    savings: null as string | null,
    legalLine: 'Subscription renews automatically every month at ₹99 until cancelled.',
  },
  annual: {
    id: 'annual' as const,
    label: 'Annual',
    price: '₹699',
    subLabel: 'per year · just ₹58/month',
    paise: 69900,
    badge: 'Save 41%',
    savings: 'Save ₹489 compared to monthly',
    legalLine: 'Subscription renews automatically every year at ₹699 until cancelled.',
  },
} as const;

// ── Features — accurate, non-misleading ──────────────────────────────────────
const FEATURES = [
  { icon: Mic,         title: 'Full Voice Mode',             desc: 'Unlimited AI voice conversations with Novo' },
  { icon: Award,       title: 'Unlimited Certifications',    desc: 'Earn proof-of-mastery certificates for every topic' },
  { icon: BarChart3,   title: 'AI Study Analytics',         desc: 'Weak-topic heatmap and study progress tracking' },
  { icon: BookOpen,    title: 'Unlimited Study Plans',       desc: 'Generate custom revision plans anytime' },
  { icon: Sparkles,    title: 'Novo AI Priority Access',    desc: 'Faster AI responses and extended sessions' },
  { icon: Zap,         title: 'Novo Memory',                 desc: 'Novo remembers your goals, style, and weak areas' },
  { icon: GraduationCap, title: 'Exam-specific Coaching',   desc: 'Personalised guidance for JEE, NEET, CBSE and more' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function callFn(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke('novo-subscription', {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProSubscriptionPage() {
  const { user, profile, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const platform = getIAPPlatform();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [loading,      setLoading]      = useState(false);
  const [restoring,    setRestoring]    = useState(false);
  const [showReturnHint, setShowReturnHint] = useState(false);
  const [status,       setStatus]       = useState<{ is_pro: boolean; pro_expires_at: string | null; active_plan: string | null } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [errorMsg,      setErrorMsg]    = useState('');

  const isPro = profile?.is_pro && (
    !profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()
  );

  useEffect(() => {
    (async () => {
      setStatusLoading(true);
      const res = await callFn({ action: 'get_status' });
      if (!res.error) setStatus(res.data);
      setStatusLoading(false);
    })();
  }, [user]);

  async function refreshStatus() {
    setStatusLoading(true);
    const res = await callFn({ action: 'get_status' });
    if (!res.error) setStatus(res.data);
    await refetchProfile();
    setStatusLoading(false);
  }

  // ── Purchase handler ─────────────────────────────────────────────────────
  async function handleSubscribe() {
    if (!user) return;
    setErrorMsg('');
    setLoading(true);

    try {
      // Open web checkout in an in-app browser — works on all platforms,
      // no third-party payment processor inside the native app.
      const { data: { session } } = await supabase.auth.getSession();
      const plan = selectedPlan === 'annual' ? 'annual' : 'monthly';
      let url = `https://edora-bb02e.web.app/pro?plan=${plan}`;
      if (session?.access_token) {
        url += `#token=${encodeURIComponent(session.access_token)}`;
      }
      await Browser.open({ url, presentationStyle: 'popover' });
      // After they close the browser, refresh profile in case they subscribed
      setShowReturnHint(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not open checkout. Please try again.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Restore purchases ─────────────────────────────────────────────────────
  async function handleRestore() {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        await refetchProfile();
        await Toast.show({ text: '✅ Pro access restored!', duration: 'long' });
        navigate('/home');
      } else {
        await Toast.show({ text: 'No active subscription found for this account.', duration: 'long' });
      }
    } catch {
      await Toast.show({ text: 'Restore failed. Please try again.', duration: 'long' });
    } finally {
      setRestoring(false);
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  async function handleCancel() {
    if (platform !== 'web') {
      // Native subscriptions must be cancelled in the store settings
      await Toast.show({
        text: platform === 'android'
          ? 'To cancel, go to Google Play Store → Subscriptions → Edora Pro'
          : 'To cancel, go to iPhone Settings → Apple ID → Subscriptions → Edora Pro',
        duration: 'long',
      });
      setCancelConfirm(false);
      return;
    }
    setLoading(true);
    const res = await callFn({ action: 'cancel' });
    if (!res.error) {
      await refetchProfile();
      setCancelConfirm(false);
      const msg = res.data?.message ?? 'Subscription cancelled.';
      alert(msg);
      const sr = await callFn({ action: 'get_status' });
      if (!sr.error) setStatus(sr.data);
    }
    setLoading(false);
  }

  // ── Active Pro view ────────────────────────────────────────────────────────
  if (!statusLoading && isPro) {
    const expiresDate = profile?.pro_expires_at
      ? new Date(profile.pro_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return (
      <div className="flex flex-col h-full" style={{ background: '#0A0A0F' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'rgba(10,10,15,0.9)', borderBottom: '1px solid rgba(124,58,237,0.15)', backdropFilter: 'blur(16px)' }}>
          <Link to="/profile" aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <ChevronLeft size={18} className="text-white" />
          </Link>
          <div className="flex-1">
            <h2 className="font-heading font-bold text-white text-sm">Edora Pro</h2>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Your subscription</p>
          </div>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
            <Crown size={10} /> Pro Active
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>

          {/* Hero card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-6 text-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #1A0A3E 0%, #0F0A1F 100%)', border: '1px solid rgba(124,58,237,0.3)' }}>
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(circle at 50% 0%, #7C3AED, transparent 60%)' }} />
            <div className="relative">
              <NovoAvatar state="celebrating" size="lg" className="mx-auto mb-4" />
              <h2 className="font-heading text-2xl font-bold text-white mb-1">You're Pro!</h2>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>All Novo Pro features unlocked</p>
              {expiresDate && (
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Next billing date: {expiresDate}</p>
              )}
              {status?.active_plan && (
                <span className="mt-3 inline-block px-4 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(124,58,237,0.25)', color: '#A855F7', border: '1px solid rgba(124,58,237,0.35)' }}>
                  {PLANS[status.active_plan as keyof typeof PLANS]?.label ?? status.active_plan} plan
                </span>
              )}
            </div>
          </motion.div>

          {/* AI content disclosure */}
          <div className="rounded-2xl p-3.5 flex items-start gap-2.5"
            style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
            <Info size={14} className="shrink-0 mt-0.5" style={{ color: '#A855F7' }} />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Novo AI generates content using large language models. All AI responses should be verified against your textbooks and official sources, especially for exams.
            </p>
          </div>

          {/* Features */}
          <div className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: '#0F1117', border: '1px solid rgba(124,58,237,0.12)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Everything you have
            </p>
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(124,58,237,0.15)' }}>
                    <Icon size={14} style={{ color: '#A855F7' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {platform !== 'web' && (
            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              To cancel, manage your subscription in {platform === 'android' ? 'Google Play Store' : 'iPhone Settings'} → Subscriptions.
            </p>
          )}
          {platform === 'web' && (
            <button onClick={() => setCancelConfirm(true)}
              className="text-center text-xs py-2"
              style={{ color: 'rgba(255,255,255,0.3)' }}>
              Cancel subscription
            </button>
          )}
        </div>

        {/* Cancel confirm sheet (web only — native uses store) */}
        <AnimatePresence>
          {cancelConfirm && (
            <motion.div className="fixed inset-0 z-50 flex items-end"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/60" onClick={() => setCancelConfirm(false)} />
              <motion.div className="relative w-full rounded-t-3xl p-6 pb-10"
                style={{ background: '#0F1117', backdropFilter: 'blur(24px)', borderTop: '1px solid rgba(124,58,237,0.2)' }}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
                <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.12)' }} />
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(239,68,68,0.12)' }}>
                    <AlertCircle size={20} className="text-red-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Cancel subscription?</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      Pro access continues until the current billing period ends
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="flex-1 py-3 rounded-xl font-semibold text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={() => setCancelConfirm(false)}>Keep Pro</button>
                  <button className="flex-1 py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'rgba(239,68,68,0.75)' }}
                    onClick={handleCancel} disabled={loading}>
                    {loading ? <RefreshCw size={14} className="animate-spin" /> : 'Yes, cancel'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Upgrade view ───────────────────────────────────────────────────────────
  const currentPlan = PLANS[selectedPlan];

  return (
    <div className="flex flex-col h-full" style={{ background: '#0A0A0F' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,10,15,0.9)', borderBottom: '1px solid rgba(124,58,237,0.12)', backdropFilter: 'blur(16px)' }}>
        <Link to="/profile" aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Edora Pro</h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Student-friendly pricing</p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 flex flex-col gap-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 120px)' }}>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-6 text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #1A0A3E 0%, #0A0A0F 100%)', border: '1px solid rgba(124,58,237,0.25)' }}>
          <div className="absolute inset-0 opacity-30"
            style={{ background: 'radial-gradient(ellipse at 50% -10%, #7C3AED, transparent 60%)' }} />
          <div className="relative flex flex-col items-center">
            <NovoAvatar state="celebrating" size="lg" className="mb-4" />
            <h2 className="font-heading text-2xl font-bold text-white mb-1">Edora Pro</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Novo's full brain, unlocked — less than a cup of chai
            </p>
          </div>
        </motion.div>

        {/* AI disclosure — required by Google Play AI policy */}
        <div className="rounded-2xl p-3.5 flex items-start gap-2.5"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
          <Info size={14} className="shrink-0 mt-0.5 text-indigo-400" />
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <span className="font-semibold text-white/70">AI-powered app.</span> Novo uses AI to generate educational content, explanations, and diagrams. Always verify important facts with your textbook or official sources.
          </p>
        </div>

        {/* Plan toggle */}
        <div className="flex flex-col gap-3">
          {(Object.values(PLANS)).map(plan => {
            const active = selectedPlan === plan.id;
            return (
              <motion.button key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                whileTap={{ scale: 0.98 }}
                className="relative rounded-2xl p-4 text-left transition-all"
                style={active
                  ? { background: 'rgba(124,58,237,0.12)', border: '2px solid #7C3AED' }
                  : { background: '#0F1117', border: '2px solid rgba(255,255,255,0.08)' }}>
                {plan.badge && (
                  <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
                    {plan.badge}
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading font-bold text-white text-lg leading-none">{plan.price}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{plan.subLabel}</p>
                    {plan.savings && active && (
                      <p className="text-xs font-semibold mt-1" style={{ color: '#A855F7' }}>{plan.savings}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{plan.label}</span>
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
                      style={active
                        ? { borderColor: '#7C3AED', background: '#7C3AED' }
                        : { borderColor: 'rgba(255,255,255,0.2)' }}>
                      {active && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Free vs Pro comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-3.5"
            style={{ background: '#0F1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-bold mb-2.5 uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>Free</p>
            {['5 certs/month', '2 plans/week', '10 voice msgs/day', 'Basic analytics'].map((l, i) => (
              <div key={i} className="flex items-start gap-1.5 mb-1.5">
                <X size={11} className="shrink-0 mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{l}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-3.5"
            style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <p className="text-xs font-bold mb-2.5 uppercase tracking-wide" style={{ color: '#A855F7' }}>Pro</p>
            {['Unlimited certs', 'Unlimited plans', 'Full voice mode', 'AI analytics'].map((l, i) => (
              <div key={i} className="flex items-start gap-1.5 mb-1.5">
                <CheckCircle2 size={11} className="shrink-0 mt-0.5" style={{ color: '#A855F7' }} />
                <p className="text-xs font-medium text-white">{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature cards */}
        <div className="flex flex-col gap-2.5">
          <p className="text-xs font-bold uppercase tracking-wider px-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Everything in Pro
          </p>
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div key={i}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 + 0.1 }}
                className="flex items-start gap-3 rounded-2xl p-3.5"
                style={{ background: '#0F1117', border: '1px solid rgba(124,58,237,0.1)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(168,85,247,0.2))' }}>
                  <Icon size={16} style={{ color: '#A855F7' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{f.desc}</p>
                </div>
                <CheckCircle2 size={14} style={{ color: '#A855F7' }} className="shrink-0 mt-1" />
              </motion.div>
            );
          })}
        </div>

        {/* Trust signals */}
        <div className="rounded-2xl p-4 flex flex-col gap-2.5"
          style={{ background: '#0F1117', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { Icon: Shield,        text: platform === 'android' ? 'Payment secured by Google Play' : platform === 'ios' ? 'Payment secured by Apple App Store' : 'Secure checkout' },
            { Icon: CalendarDays,  text: 'Cancel anytime from your store account — no lock-in' },
            { Icon: GraduationCap, text: 'Built for Indian students, priced fairly' },
          ].map(({ Icon, text }, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Icon size={13} style={{ color: 'rgba(255,255,255,0.3)' }} className="shrink-0" />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Restore purchases */}
        {platform !== 'web' && (
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="text-center text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ color: 'rgba(255,255,255,0.35)' }}>
            {restoring ? <RefreshCw size={11} className="animate-spin" /> : null}
            Restore previous purchase
          </button>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-xl p-3 flex items-start gap-2.5"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{errorMsg}</p>
          </div>
        )}
      </div>

      {/* Sticky CTA — with full pricing disclosure (Play Billing policy) */}
      <div className="shrink-0 px-4 pt-3"
        style={{
          background: 'rgba(10,10,15,0.97)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(124,58,237,0.15)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)',
        }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full h-13 rounded-2xl font-heading font-bold text-base text-white flex items-center justify-center gap-2.5 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', height: 52, boxShadow: '0 0 32px rgba(124,58,237,0.45)' }}>
          {loading
            ? <><RefreshCw size={16} className="animate-spin" /> Processing…</>
            : <><Crown size={16} /> Upgrade to Pro — {currentPlan.price}</>}
        </motion.button>

        {/* Legally required billing disclosure */}
        <p className="text-center text-xs mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.28)' }}>
          {currentPlan.legalLine}{' '}
          {platform !== 'web' ? 'Cancel anytime in your store account settings.' : 'Cancel anytime.'}{' '}
          By subscribing you agree to our{' '}
          <button
            onClick={() => Browser.open({ url: 'https://edora-bb02e.web.app/terms', presentationStyle: 'popover' })}
            className="underline" style={{ color: 'rgba(168,85,247,0.7)' }}>
            Terms
          </button>{' '}and{' '}
          <button
            onClick={() => Browser.open({ url: 'https://edora-bb02e.web.app/privacy-policy', presentationStyle: 'popover' })}
            className="underline" style={{ color: 'rgba(168,85,247,0.7)' }}>
            Privacy Policy
          </button>.
        </p>

        {/* Return hint — shown after browser closes */}
        <AnimatePresence>
          {showReturnHint && (
            <motion.button
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              onClick={async () => { setShowReturnHint(false); await refreshStatus(); }}
              className="w-full mt-2 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#A855F7' }}>
              <RefreshCw size={14} /> Already subscribed? Tap to activate
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
