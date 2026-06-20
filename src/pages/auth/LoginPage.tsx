import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, User, ArrowRight, X, ShieldCheck } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CharacterImage } from '@/components/ui/CharacterImage';
import { Events } from '@/lib/analytics';

const NATIVE_REDIRECT = 'com.edora.app://auth/callback';
const WEB_REDIRECT    = `${window.location.origin}/home`;

const BG      = '#0A0A0F';
const PURPLE  = 'linear-gradient(135deg,#7C3AED,#A855F7)';
const DARK    = '#F4F6FA';
const GRAY    = 'rgba(255,255,255,0.5)';
const BORDER  = 'rgba(255,255,255,0.08)';

// Google SVG inline
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill={DARK} d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}


export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode]             = useState<'login' | 'signup'>('login');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [name, setName]             = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('edora_remember_email'));
  const [dpdpConsent, setDpdpConsent] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Restore remembered email
  useEffect(() => {
    const saved = localStorage.getItem('edora_remember_email');
    if (saved) setEmail(saved);
  }, []);

  function switchMode(m: 'login' | 'signup') {
    setMode(m);
    setError('');
    setPassword('');
    setConfirmPass('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      if (!name.trim()) { setError('Please enter your name.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPass) { setError('Passwords do not match.'); return; }
      if (!dpdpConsent) { setError('Please accept the Privacy Policy to continue.'); return; }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (rememberMe) localStorage.setItem('edora_remember_email', email);
        else localStorage.removeItem('edora_remember_email');
      } else {
        Events.signupStarted({ method: 'email' });
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name:            name.trim(),
              dpdp_consent_at:      new Date().toISOString(),
              dpdp_consent_version: 'v2026.06',
            },
          },
        });
        if (error) throw error;
        Events.signupCompleted({ method: 'email' });
        Events.dpdpConsentGiven({ version: 'v2026.06' });
        setError('Check your email for a confirmation link before signing in.');
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openOAuth(provider: 'google' | 'apple') {
    setError('');
    if (Capacitor.isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
      });
      if (error) { setError(error.message); return; }
      if (data?.url) await Browser.open({ url: data.url, windowName: '_self' });
    } else {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: WEB_REDIRECT },
      });
    }
  }

  async function sendForgotPassword() {
    if (!forgotEmail.trim()) { return; }
    setForgotLoading(true);
    try {
      const redirectTo = Capacitor.isNativePlatform()
        ? NATIVE_REDIRECT
        : `${window.location.origin}/login`;
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo });
      setForgotSent(true);
    } catch {
      // silently succeed — don't reveal if email exists
      setForgotSent(true);
    } finally {
      setForgotLoading(false);
    }
  }

  const inputClass = "flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400";
  const inputStyle = { color: DARK, WebkitUserSelect: 'text' as const, userSelect: 'text' as const };
  const fieldWrap = {
    background: 'rgba(15,17,23,0.9)',
    border: `1.5px solid ${BORDER}`,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 16,
    height: 56,
    boxShadow: '0 1px 4px rgba(91,106,245,0.06)',
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: BG }}>
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* ── Illustration hero (top 42%) ── */}
      <div className="relative shrink-0" style={{ height: '42%' }}>
        {/* Subtle decorative circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute rounded-full" style={{
            width: 220, height: 220, top: -40, right: -40,
            background: 'rgba(91,106,245,0.08)', filter: 'blur(1px)',
          }} />
          <div className="absolute rounded-full" style={{
            width: 140, height: 140, bottom: 20, left: -20,
            background: 'rgba(139,92,246,0.07)',
          }} />
        </div>

        {/* App wordmark */}
        <div className="absolute top-4 left-0 right-0 flex justify-center">
          <p className="font-heading text-xl font-black tracking-wider" style={{ color: '#5B6AF5' }}>
            EDORA
          </p>
        </div>

        <CharacterImage slug="login-character" anim="float" fillParent fallbackEmoji="📚" />
      </div>

      {/* ── Form card (bottom 58%) ── */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="flex-1 overflow-y-auto native-scroll px-6 pt-6 pb-safe"
        style={{
          background: 'rgba(15,17,23,0.9)',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          boxShadow: '0 -4px 24px rgba(91,106,245,0.08)',
        }}
      >
        {/* Title */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold" style={{ color: DARK }}>
            {mode === 'login' ? 'Welcome Back! 👋' : 'Create Account ✨'}
          </h1>
          <p className="text-sm mt-1" style={{ color: GRAY }}>
            {mode === 'login' ? 'Sign in to continue your learning journey' : 'Join EDORA and start learning smarter'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name — signup only */}
          <AnimatePresence>
            {mode === 'signup' && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 56, marginBottom: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                style={fieldWrap}
              >
                <User size={18} color="#9CA3AF" />
                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  autoComplete="name"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <div style={fieldWrap}>
            <Mail size={18} color="#9CA3AF" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
              style={inputStyle}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div style={fieldWrap}>
            <Lock size={18} color="#9CA3AF" />
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
              style={inputStyle}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button type="button" onClick={() => setShowPass(v => !v)} className="shrink-0 touch-target">
              {showPass
                ? <EyeOff size={18} color="#9CA3AF" />
                : <Eye size={18} color="#9CA3AF" />}
            </button>
          </div>

          {/* Confirm password — signup only */}
          <AnimatePresence>
            {mode === 'signup' && (
              <motion.div
                key="confirm-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 56 }}
                exit={{ opacity: 0, height: 0 }}
                style={fieldWrap}
              >
                <Lock size={18} color="#9CA3AF" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} className="shrink-0 touch-target">
                  {showConfirm
                    ? <EyeOff size={18} color="#9CA3AF" />
                    : <Eye size={18} color="#9CA3AF" />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* DPDP consent — signup only */}
          <AnimatePresence>
            {mode === 'signup' && (
              <motion.button
                key="dpdp-consent"
                type="button"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onClick={() => setDpdpConsent(v => !v)}
                className="flex items-start gap-3 text-left active:opacity-70 transition-opacity mt-1"
              >
                <div
                  className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                  style={dpdpConsent
                    ? { background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', borderColor: '#5B6AF5' }
                    : { borderColor: BORDER, background: 'rgba(15,17,23,0.9)' }}
                >
                  {dpdpConsent && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-xs leading-relaxed" style={{ color: GRAY }}>
                  I agree to Edora's{' '}
                  <span
                    className="font-semibold underline"
                    style={{ color: '#5B6AF5' }}
                    onClick={e => { e.stopPropagation(); navigate('/privacy-policy'); }}
                  >Privacy Policy</span>
                  {' '}and{' '}
                  <span
                    className="font-semibold underline"
                    style={{ color: '#5B6AF5' }}
                    onClick={e => { e.stopPropagation(); navigate('/terms-of-service'); }}
                  >Terms of Service</span>.
                  {' '}My data is protected under India's DPDP Act 2023.{' '}
                  <ShieldCheck size={12} className="inline mb-0.5" style={{ color: '#10B981' }} />
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Remember me + Forgot password (login only) */}
          {mode === 'login' && (
            <div className="flex items-center justify-between mt-1">
              <button
                type="button"
                onClick={() => setRememberMe(v => !v)}
                className="flex items-center gap-2 active:opacity-70 transition-opacity"
              >
                <div
                  className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                  style={rememberMe
                    ? { background: PURPLE, borderColor: '#5B6AF5' }
                    : { borderColor: BORDER, background: 'rgba(15,17,23,0.9)' }}
                >
                  {rememberMe && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-xs font-medium" style={{ color: GRAY }}>Remember me</span>
              </button>
              <button
                type="button"
                onClick={() => { setForgotOpen(true); setForgotEmail(email); setForgotSent(false); }}
                className="text-xs font-semibold active:opacity-60 transition-opacity"
                style={{ color: '#5B6AF5' }}
              >
                Forgot Password?
              </button>
            </div>
          )}

          {/* Error / success message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-xs text-center px-2 py-2 rounded-xl font-medium ${
                error.includes('confirmation') || error.includes('Check')
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-red-600 bg-red-50'
              }`}
            >
              {error}
            </motion.p>
          )}

          {/* CTA button */}
          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 mt-1 disabled:opacity-60 transition-opacity"
            style={{ background: PURPLE, boxShadow: '0 6px 24px rgba(91,106,245,0.35)' }}
          >
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                {mode === 'login' ? 'Login' : 'Create Account'}
                <ArrowRight size={18} />
              </>
            )}
          </motion.button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ background: BORDER }} />
          <span className="text-xs font-medium" style={{ color: '#C0C4D6' }}>or</span>
          <div className="flex-1 h-px" style={{ background: BORDER }} />
        </div>

        {/* OAuth buttons — side by side */}
        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => openOAuth('google')}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
            style={{ background: 'rgba(15,17,23,0.9)', border: `1.5px solid ${BORDER}`, color: DARK, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <GoogleIcon />
            Google
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => openOAuth('apple')}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
            style={{ background: 'rgba(15,17,23,0.9)', border: `1.5px solid ${BORDER}`, color: DARK, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <AppleIcon />
            Apple
          </motion.button>
        </div>

        {/* Mode switch */}
        <p className="text-center text-sm mt-5 mb-2" style={{ color: GRAY }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="font-bold active:opacity-60 transition-opacity"
            style={{ color: '#5B6AF5' }}
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>

        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} className="pb-4" />
      </motion.div>

      {/* ── Forgot Password modal ── */}
      <AnimatePresence>
        {forgotOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: 'rgba(26,26,46,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setForgotOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full rounded-t-3xl px-6 pt-4 pb-safe"
              style={{ background: 'rgba(15,17,23,0.9)', boxShadow: '0 -4px 32px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: '#E5E7EB' }} />

              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-xl font-bold" style={{ color: DARK }}>
                  Reset Password
                </h2>
                <button aria-label="Close" onClick={() => setForgotOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <X size={16} color={GRAY} />
                </button>
              </div>

              {forgotSent ? (
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">📬</div>
                  <p className="font-semibold text-base mb-1" style={{ color: DARK }}>Check your inbox</p>
                  <p className="text-sm" style={{ color: GRAY }}>
                    We've sent a password reset link to{' '}
                    <span className="font-semibold" style={{ color: '#5B6AF5' }}>{forgotEmail}</span>
                  </p>
                  <button
                    onClick={() => setForgotOpen(false)}
                    className="mt-5 w-full py-3.5 rounded-2xl font-bold text-white text-sm"
                    style={{ background: PURPLE }}
                  >
                    Got It
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm mb-5" style={{ color: GRAY }}>
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                  <div style={fieldWrap}>
                    <Mail size={18} color="#9CA3AF" />
                    <input
                      type="email"
                      placeholder="Email address"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      className={inputClass}
                      style={inputStyle}
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={sendForgotPassword}
                    disabled={forgotLoading || !forgotEmail.trim()}
                    className="mt-4 w-full py-3.5 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: PURPLE, boxShadow: '0 4px 16px rgba(91,106,245,0.3)' }}
                  >
                    {forgotLoading
                      ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      : 'Send Reset Link'}
                  </button>
                </>
              )}
              <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} className="pb-4" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
