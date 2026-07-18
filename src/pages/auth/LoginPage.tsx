import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, User, ArrowRight, X, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CharacterImage } from '@/components/ui/CharacterImage';
import { Events } from '@/lib/analytics';

const NATIVE_REDIRECT = 'com.edora.app://auth/callback';
const WEB_REDIRECT    = `${window.location.origin}/home`;

// Maps raw Supabase/network error messages to user-friendly copy.
// Never expose internal error codes or server stack traces to the user.
function humaniseAuthError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('invalid login credentials') || s.includes('invalid_credentials'))
    return 'Incorrect email or password. Please try again.';
  if (s.includes('email not confirmed'))
    return 'Please confirm your email before signing in. Check your inbox.';
  if (s.includes('user already registered') || s.includes('already been registered'))
    return 'An account with this email already exists. Try signing in instead.';
  if (s.includes('user not found') || s.includes('no user'))
    return 'No account found with this email. Check for typos or sign up.';
  if (s.includes('rate limit') || s.includes('too many'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (s.includes('network') || s.includes('fetch') || s.includes('failed to fetch'))
    return 'No internet connection. Check your network and try again.';
  if (s.includes('weak password') || s.includes('password should be'))
    return 'Password is too weak. Use at least 8 characters with letters and numbers.';
  if (s.includes('signup disabled') || s.includes('signups not allowed'))
    return 'New sign-ups are temporarily paused. Please try again later.';
  if (s.includes('otp') || s.includes('token has expired') || s.includes('token not found'))
    return 'Code is incorrect or has expired. Request a new one.';
  if (s.includes('invalid otp') || s.includes('otp_expired'))
    return 'That code has expired. Tap "Resend code" to get a fresh one.';
  // Fallback — still better than showing raw server text
  return 'Something went wrong. Please try again.';
}

const BG     = '#0A0A0F';
const PURPLE = 'linear-gradient(135deg,#6D28D9,#9333EA)';
const DARK   = '#F4F6FA';
const GRAY   = 'var(--ink-500)';
const BORDER = 'var(--ink-180)';

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

// ── OTP digit input ──────────────────────────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref0 = useRef<HTMLInputElement>(null);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);
  const ref4 = useRef<HTMLInputElement>(null);
  const ref5 = useRef<HTMLInputElement>(null);
  const refs = [ref0, ref1, ref2, ref3, ref4, ref5];

  function handleChange(i: number, char: string) {
    const digits = value.split('');
    digits[i] = char.replace(/\D/g, '').slice(-1);
    const next = digits.join('');
    onChange(next);
    if (char && i < 5) refs[i + 1].current?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs[i - 1].current?.focus();
      const digits = value.split('');
      digits[i - 1] = '';
      onChange(digits.join(''));
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, ''));
    refs[Math.min(pasted.length, 5)].current?.focus();
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-11 h-14 text-center text-xl font-bold rounded-2xl outline-none transition-all"
          style={{
            background: 'var(--surface-elev-09)',
            border: value[i] ? '2px solid #5B6AF5' : `1.5px solid ${BORDER}`,
            color: DARK,
            WebkitUserSelect: 'text',
            caretColor: '#5B6AF5',
          }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();

  // Auth method: password or otp
  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('password');

  // Password flow
  const [mode, setMode]               = useState<'login' | 'signup'>('login');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [name, setName]               = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [rememberMe, setRememberMe]   = useState(() => !!localStorage.getItem('edora_remember_email'));
  const [dpdpConsent, setDpdpConsent] = useState(false);

  // OTP flow
  const [otpEmail, setOtpEmail]       = useState('');
  const [otpCode, setOtpCode]         = useState('');
  const [otpSent, setOtpSent]         = useState(false);
  const [otpConsent, setOtpConsent]   = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Shared
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [forgotOpen, setForgotOpen]       = useState(false);
  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotSent, setForgotSent]       = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError]     = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('edora_remember_email');
    if (saved) setEmail(saved);
  }, []);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  function switchMode(m: 'login' | 'signup') {
    setMode(m); setError(''); setPassword(''); setConfirmPass('');
  }

  function switchMethod(m: 'password' | 'otp') {
    setAuthMethod(m); setError(''); setOtpSent(false); setOtpCode('');
  }

  // ── Password submit ──────────────────────────────────────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'signup') {
      if (!name.trim())              { setError('Please enter your name.'); return; }
      if (password.length < 8)       { setError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPass)  { setError('Passwords do not match.'); return; }
      if (!dpdpConsent)              { setError('Please accept the Privacy Policy to continue.'); return; }
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (mode === 'login' && !password) { setError('Please enter your password.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        if (rememberMe) localStorage.setItem('edora_remember_email', email);
        else localStorage.removeItem('edora_remember_email');
      } else {
        Events.signupStarted({ method: 'email' });
        const { error } = await supabase.auth.signUp({
          email, password,
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
        setError('✓ Account created! Check your email to confirm before signing in.');
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      setError(humaniseAuthError((err as Error).message ?? ''));
    } finally {
      setLoading(false);
    }
  }

  // ── OTP: send code ───────────────────────────────────────────────────────
  async function sendOtp() {
    if (!otpEmail.trim())   { setError('Enter your email address.'); return; }
    if (!otpConsent)        { setError('Please accept the Privacy Policy to continue.'); return; }
    setError(''); setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: otpEmail.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setOtpSent(true);
      setResendTimer(60);
      setOtpCode('');
    } catch (err: unknown) {
      setError(humaniseAuthError((err as Error).message ?? ''));
    } finally {
      setLoading(false);
    }
  }

  // ── OTP: verify code ─────────────────────────────────────────────────────
  async function verifyOtp() {
    if (otpCode.replace(/\D/g, '').length < 6) {
      setError('Enter the 6-digit code from your email.'); return;
    }
    setError(''); setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: otpEmail.trim(),
        token: otpCode,
        type:  'email',
      });
      if (error) throw error;
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      // Update DPDP consent metadata for new OTP users
      await supabase.auth.updateUser({
        data: {
          dpdp_consent_at:      new Date().toISOString(),
          dpdp_consent_version: 'v2026.06',
        },
      });
      Events.signupCompleted({ method: 'email' });
    } catch (err: unknown) {
      // Give specific feedback: wrong code vs expired vs network
      const msg = (err as Error).message ?? '';
      setError(humaniseAuthError(msg));
    } finally {
      setLoading(false);
    }
  }

  // ── OAuth ────────────────────────────────────────────────────────────────
  async function openOAuth(provider: 'google' | 'apple') {
    setError('');
    if (Capacitor.isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
      });
      if (error) { setError(humaniseAuthError(error.message)); return; }
      if (data?.url) await Browser.open({ url: data.url, windowName: '_self' });
    } else {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: WEB_REDIRECT },
      });
    }
  }

  // ── Forgot password ──────────────────────────────────────────────────────
  async function sendForgotPassword() {
    if (!forgotEmail.trim()) return;
    setForgotError('');
    setForgotLoading(true);
    try {
      const redirectTo = Capacitor.isNativePlatform()
        ? NATIVE_REDIRECT
        : `${window.location.origin}/login`;

      // Race the Supabase call against a 10-second timeout so the spinner
      // never hangs forever on a dead network connection.
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 10_000)
      );
      await Promise.race([
        supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo }),
        timeoutPromise,
      ]);

      setForgotSent(true);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      if (msg === 'TIMEOUT') {
        setForgotError('Request timed out. Check your connection and try again.');
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        setForgotError('No internet connection. Please try again.');
      } else {
        // Supabase intentionally returns success for unknown emails (security).
        // Any other error is still surfaced so we don't silently fail.
        setForgotError('Something went wrong. Please try again.');
      }
    } finally {
      setForgotLoading(false);
    }
  }

  const inputClass = "flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400";
  const inputStyle = { color: DARK, WebkitUserSelect: 'text' as const, userSelect: 'text' as const };
  const fieldWrap  = {
    background: 'var(--surface-elev-09)', border: `1.5px solid ${BORDER}`,
    borderRadius: 16, display: 'flex', alignItems: 'center',
    gap: 12, paddingLeft: 16, paddingRight: 16, height: 56,
    boxShadow: '0 1px 4px rgba(91,106,245,0.06)',
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG }}>
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* Hero */}
      <div className="relative shrink-0" style={{ height: '38%' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute rounded-full" style={{ width: '56vw', height: '56vw', maxWidth: 220, maxHeight: 220, top: -40, right: -40, background: 'rgba(91,106,245,0.08)', filter: 'blur(1px)' }} />
          <div className="absolute rounded-full" style={{ width: '36vw', height: '36vw', maxWidth: 140, maxHeight: 140, bottom: 20, left: -20, background: 'rgba(139,92,246,0.07)' }} />
        </div>
        <div className="absolute top-4 left-0 right-0 flex justify-center">
          <p className="font-heading text-xl font-black tracking-wider" style={{ color: '#5B6AF5' }}>EDORA</p>
        </div>
        <CharacterImage slug="login-character" anim="float" fillParent />
      </div>

      {/* Form card */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="flex-1 overflow-y-auto native-scroll px-6 pt-5 pb-safe"
        style={{ background: 'var(--surface-elev-09)', borderTopLeftRadius: 32, borderTopRightRadius: 32, boxShadow: '0 -4px 24px rgba(91,106,245,0.08)' }}
      >
        {/* Title */}
        <div className="mb-4">
          <h1 className="font-heading text-2xl font-bold" style={{ color: DARK }}>
            {authMethod === 'otp' ? 'Quick Sign In' : mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-sm mt-1" style={{ color: GRAY }}>
            {authMethod === 'otp'
              ? 'No password needed — we\'ll email you a code'
              : mode === 'login' ? 'Sign in to continue your learning journey' : 'Join EDORA and start learning smarter'}
          </p>
        </div>

        {/* Auth method tabs */}
        <div className="flex gap-2 mb-4 p-1 rounded-2xl" style={{ background: 'var(--v2-elevated)', border: `1px solid ${BORDER}` }}>
          {(['password', 'otp'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMethod(m)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              style={authMethod === m
                ? { background: 'var(--v2-primary)', color: '#fff' }
                : { color: GRAY }}
            >
              {m === 'password' ? <><Lock size={13} /> Password</> : <><KeyRound size={13} /> Email OTP</>}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── PASSWORD TAB ── */}
          {authMethod === 'password' && (
            <motion.div key="password-tab"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>

              {/* Login / Signup pills */}
              <div className="flex gap-2 mb-4">
                {(['login', 'signup'] as const).map(m => (
                  <button key={m} type="button" onClick={() => switchMode(m)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={mode === m
                      ? { background: 'var(--v2-primary-tint-2)', color: 'var(--v2-primary)', border: '1px solid var(--v2-primary)' }
                      : { color: GRAY, border: `1px solid ${BORDER}` }}>
                    {m === 'login' ? 'Sign In' : 'Sign Up'}
                  </button>
                ))}
              </div>

              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
                <AnimatePresence>
                  {mode === 'signup' && (
                    <motion.div key="name-field"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 56 }}
                      exit={{ opacity: 0, height: 0 }} style={fieldWrap}>
                      <User size={18} color="#9CA3AF" />
                      <input type="text" placeholder="Your full name" value={name}
                        onChange={e => setName(e.target.value)}
                        className={inputClass} style={inputStyle} autoComplete="name"
                        aria-label="Full name" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={fieldWrap}>
                  <Mail size={18} color="#9CA3AF" />
                  <input type="email" placeholder="Email address" value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={inputClass} style={inputStyle} autoComplete="email"
                    autoFocus aria-label="Email address" />
                </div>

                <div style={fieldWrap}>
                  <Lock size={18} color="#9CA3AF" />
                  <input type={showPass ? 'text' : 'password'} placeholder="Password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className={inputClass} style={inputStyle}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    aria-label="Password" />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="shrink-0"
                    aria-label={showPass ? 'Hide password' : 'Show password'}>
                    {showPass ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
                  </button>
                </div>

                <AnimatePresence>
                  {mode === 'signup' && (
                    <motion.div key="confirm-field"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 56 }}
                      exit={{ opacity: 0, height: 0 }} style={fieldWrap}>
                      <Lock size={18} color="#9CA3AF" />
                      <input type={showConfirm ? 'text' : 'password'} placeholder="Confirm password"
                        value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                        className={inputClass} style={inputStyle} autoComplete="new-password"
                        aria-label="Confirm password" />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} className="shrink-0"
                        aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}>
                        {showConfirm ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {mode === 'signup' && (
                    <motion.button key="dpdp" type="button"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onClick={() => setDpdpConsent(v => !v)}
                      className="flex items-start gap-3 text-left active:opacity-70 mt-1">
                      <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                        style={dpdpConsent
                          ? { background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', borderColor: '#5B6AF5' }
                          : { borderColor: BORDER, background: 'var(--surface-elev-09)' }}>
                        {dpdpConsent && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="text-xs leading-relaxed" style={{ color: GRAY }}>
                        I agree to Edora's{' '}
                        <span className="font-semibold underline" style={{ color: '#5B6AF5' }}
                          onClick={e => { e.stopPropagation(); navigate('/privacy-policy'); }}>Privacy Policy</span>
                        {' '}and{' '}
                        <span className="font-semibold underline" style={{ color: '#5B6AF5' }}
                          onClick={e => { e.stopPropagation(); navigate('/terms-of-service'); }}>Terms of Service</span>.
                        {' '}My data is protected under India's DPDP Act 2023.{' '}
                        <ShieldCheck size={12} className="inline mb-0.5" style={{ color: '#10B981' }} />
                      </span>
                    </motion.button>
                  )}
                </AnimatePresence>

                {mode === 'login' && (
                  <div className="flex items-center justify-between mt-1">
                    <button type="button" onClick={() => setRememberMe(v => !v)}
                      className="flex items-center gap-2 active:opacity-70">
                      <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                        style={rememberMe
                          ? { background: PURPLE, borderColor: '#5B6AF5' }
                          : { borderColor: BORDER, background: 'var(--surface-elev-09)' }}>
                        {rememberMe && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="text-xs font-medium" style={{ color: GRAY }}>Remember me</span>
                    </button>
                    <button type="button"
                      onClick={() => { setForgotOpen(true); setForgotEmail(email); setForgotSent(false); }}
                      className="text-xs font-semibold" style={{ color: '#5B6AF5' }}>
                      Forgot Password?
                    </button>
                  </div>
                )}

                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className={`text-xs text-center px-2 py-2 rounded-xl font-medium ${
                      error.startsWith('✓') ? 'text-emerald-300 bg-emerald-500/10' : 'text-red-300 bg-red-500/10'}`}>
                    {error}
                  </motion.p>
                )}

                <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
                  onClick={() => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})}
                  className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 mt-1 disabled:opacity-60"
                  style={{ background: PURPLE, boxShadow: '0 8px 32px rgba(147,51,234,0.55), 0 2px 8px rgba(0,0,0,0.4)' }}>
                  {loading
                    ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    : <>{mode === 'login' ? 'Sign In' : 'Create Account'}<ArrowRight size={18} /></>}
                </motion.button>
              </form>

              <p className="text-center text-sm mt-4 mb-1" style={{ color: GRAY }}>
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                  className="font-bold" style={{ color: '#5B6AF5' }}>
                  {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
            </motion.div>
          )}

          {/* ── OTP TAB ── */}
          {authMethod === 'otp' && (
            <motion.div key="otp-tab"
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}
              className="flex flex-col gap-4">

              <AnimatePresence mode="wait">

                {/* Step 1 — Enter email */}
                {!otpSent && (
                  <motion.div key="otp-email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col gap-3">
                    <div style={fieldWrap}>
                      <Mail size={18} color="#9CA3AF" />
                      <input type="email" placeholder="Email address" value={otpEmail}
                        onChange={e => setOtpEmail(e.target.value)}
                        className={inputClass} style={inputStyle} autoComplete="email"
                        aria-label="Email address" />
                    </div>

                    {/* DPDP consent for OTP */}
                    <button type="button" onClick={() => setOtpConsent(v => !v)}
                      className="flex items-start gap-3 text-left active:opacity-70">
                      <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                        style={otpConsent
                          ? { background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', borderColor: '#5B6AF5' }
                          : { borderColor: BORDER, background: 'var(--surface-elev-09)' }}>
                        {otpConsent && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="text-xs leading-relaxed" style={{ color: GRAY }}>
                        I agree to Edora's{' '}
                        <span className="font-semibold underline" style={{ color: '#5B6AF5' }}
                          onClick={e => { e.stopPropagation(); navigate('/privacy-policy'); }}>Privacy Policy</span>
                        {' '}and{' '}
                        <span className="font-semibold underline" style={{ color: '#5B6AF5' }}
                          onClick={e => { e.stopPropagation(); navigate('/terms-of-service'); }}>Terms of Service</span>.
                        {' '}<ShieldCheck size={12} className="inline mb-0.5" style={{ color: '#10B981' }} />
                      </span>
                    </button>

                    {error && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-xs text-center px-2 py-2 rounded-xl font-medium text-red-300 bg-red-500/10">
                        {error}
                      </motion.p>
                    )}

                    <motion.button type="button" onClick={sendOtp} disabled={loading || !otpEmail.trim()}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: PURPLE, boxShadow: '0 6px 24px rgba(91,106,245,0.35)' }}>
                      {loading
                        ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <>Send OTP Code <ArrowRight size={18} /></>}
                    </motion.button>
                  </motion.div>
                )}

                {/* Step 2 — Enter OTP */}
                {otpSent && (
                  <motion.div key="otp-verify" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4">

                    <div className="text-center">
                      <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                        style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.2)' }}>
                        <Mail size={24} color="#A0AEFF" />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: DARK }}>Check your inbox</p>
                      <p className="text-xs mt-1" style={{ color: GRAY }}>
                        We sent a 6-digit code to{' '}
                        <span style={{ color: '#A0AEFF' }}>{otpEmail}</span>
                      </p>
                    </div>

                    <OtpInput value={otpCode} onChange={setOtpCode} />

                    {error && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-xs text-center px-2 py-2 rounded-xl font-medium text-red-300 bg-red-500/10">
                        {error}
                      </motion.p>
                    )}

                    <motion.button type="button" onClick={verifyOtp}
                      disabled={loading || otpCode.replace(/\D/g, '').length < 6}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ background: PURPLE, boxShadow: '0 6px 24px rgba(91,106,245,0.35)' }}>
                      {loading
                        ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <>Verify & Sign In <ArrowRight size={18} /></>}
                    </motion.button>

                    <div className="flex items-center justify-center gap-2">
                      {resendTimer > 0 ? (
                        <p className="text-xs" style={{ color: GRAY }}>Resend in {resendTimer}s</p>
                      ) : (
                        <button type="button" onClick={() => { setOtpSent(false); setError(''); }}
                          className="flex items-center gap-1.5 text-xs font-semibold"
                          style={{ color: '#5B6AF5' }}>
                          <RefreshCw size={12} /> Resend Code
                        </button>
                      )}
                      <span style={{ color: BORDER }}>·</span>
                      <button type="button" onClick={() => { setOtpSent(false); setOtpCode(''); setError(''); }}
                        className="text-xs" style={{ color: GRAY }}>
                        Change email
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* OAuth divider + buttons */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ background: BORDER }} />
          <span className="text-xs font-medium" style={{ color: '#C0C4D6' }}>or</span>
          <div className="flex-1 h-px" style={{ background: BORDER }} />
        </div>

        <div className="flex gap-3">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => openOAuth('google')}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: 'var(--surface-elev-09)', border: `1.5px solid ${BORDER}`, color: DARK }}>
            <GoogleIcon /> Google
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => openOAuth('apple')}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: 'var(--surface-elev-09)', border: `1.5px solid ${BORDER}`, color: DARK }}>
            <AppleIcon /> Apple
          </motion.button>
        </div>

        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} className="pb-6" />
      </motion.div>

      {/* ── Forgot Password modal ── */}
      <AnimatePresence>
        {forgotOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: 'var(--surface-scrim)', backdropFilter: 'blur(4px)' }}
            onClick={() => { setForgotOpen(false); setForgotError(""); setForgotSent(false); setForgotEmail(""); }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full rounded-t-3xl px-6 pt-4 pb-safe"
              style={{ background: 'var(--surface-elev-09)', boxShadow: '0 -4px 32px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: '#E5E7EB' }} />
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-xl font-bold" style={{ color: DARK }}>Reset Password</h2>
                <button aria-label="Close" onClick={() => { setForgotOpen(false); setForgotError(""); setForgotSent(false); setForgotEmail(""); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--ink-060)' }}>
                  <X size={16} color={GRAY} />
                </button>
              </div>
              {forgotSent ? (
                <div className="text-center py-6">
                  <Mail size={44} className="mx-auto mb-3" style={{ color: '#818CF8' }} strokeWidth={1.4} />
                  <p className="font-semibold text-base mb-1" style={{ color: DARK }}>Check your inbox</p>
                  <p className="text-sm" style={{ color: GRAY }}>
                    Reset link sent to <span className="font-semibold" style={{ color: '#5B6AF5' }}>{forgotEmail}</span>
                  </p>
                  <button onClick={() => { setForgotOpen(false); setForgotError(""); setForgotSent(false); setForgotEmail(""); }}
                    className="mt-5 w-full py-3.5 rounded-2xl font-bold text-white text-sm"
                    style={{ background: PURPLE }}>Got It</button>
                </div>
              ) : (
                <>
                  <p className="text-sm mb-5" style={{ color: GRAY }}>Enter your email and we'll send a reset link.</p>
                  <div style={fieldWrap}>
                    <Mail size={18} color="#9CA3AF" />
                    <input type="email" placeholder="Email address" value={forgotEmail}
                      onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                      className={inputClass} style={inputStyle} autoFocus
                      aria-label="Email address" />
                  </div>
                  {forgotError && (
                    <p className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
                      <span>⚠</span>{forgotError}
                    </p>
                  )}
                  <button onClick={sendForgotPassword} disabled={forgotLoading || !forgotEmail.trim()}
                    className="mt-4 w-full py-3.5 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: PURPLE, boxShadow: '0 4px 16px rgba(91,106,245,0.3)' }}>
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
