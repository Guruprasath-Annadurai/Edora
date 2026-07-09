// ═══════════════════════════════════════════════════════════════════════════
// DPDPConsentModal — DPDP Act 2023 compliance modal
//
// Shows on first login (when dpdp_consent_at is null) for all users.
// For users who indicate they're under 18, triggers parental consent flow.
// Records consent version so we can re-show if policy updates.
//
// Legal basis: DPDP Act 2023, Sections 7, 9 (children's data), 13 (rights)
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import {Shield, ChevronRight, Check,
  User, Users, Lock, AlertTriangle} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { Link } from 'react-router-dom';

const CONSENT_VERSION = 'v2026.06';

interface Props {
  userId: string;
  onAccepted: () => void;
}

type Step = 'age_check' | 'consent' | 'parental';

export default function DPDPConsentModal({ userId, onAccepted }: Props) {
  const [step, setStep]               = useState<Step>('age_check');
  const [isMinor, setIsMinor]         = useState<boolean | null>(null);
  const [checked, setChecked]         = useState({ processing: false, rights: false, ai: false });
  const [saving, setSaving]           = useState(false);
  const [parentEmail, setParentEmail] = useState('');
  const [parentSent, setParentSent]   = useState(false);

  const allChecked = checked.processing && checked.rights && checked.ai;

  async function acceptConsent() {
    if (!allChecked) return;
    setSaving(true);
    try {
      await supabase.from('profiles').update({
        dpdp_consent_at:      new Date().toISOString(),
        dpdp_consent_version: CONSENT_VERSION }).eq('id', userId);
      track('dpdp_consent_given', { version: CONSENT_VERSION, is_minor: isMinor });
      onAccepted();
    } finally {
      setSaving(false);
    }
  }

  async function sendParentalConsent() {
    if (!parentEmail.trim()) return;
    setSaving(true);
    try {
      // Store parent email for verification — edge function will send OTP email
      // Send parental consent email via existing parent-link function
      await supabase.functions.invoke('parent-link', {
        body: { action: 'request_consent', parent_email: parentEmail.trim() } });
      setParentSent(true);
      track('parental_consent_requested', { parent_email_domain: parentEmail.split('@')[1] });
    } catch { /* fire and forget */ }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} transition={spring.sheet}
        className="w-full max-w-md rounded-t-3xl overflow-hidden"
        style={{ background: 'var(--surface-sheet)', border: '1px solid var(--ink-080)', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4"
          style={{ borderBottom: '1px solid var(--ink-070)' }}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)' }}>
            <Shield size={20} style={{ color: '#5B6AF5' }} />
          </div>
          <div>
            <h2 className="font-heading font-bold text-white text-base">Your Privacy Matters</h2>
            <p className="text-xs text-white/40">DPDP Act 2023 — Required consent</p>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4" style={{ maxHeight: 'calc(92vh - 80px)' }}>
          <AnimatePresence mode="wait">

            {/* ── Step 1: Age Check ── */}
            {step === 'age_check' && (
              <motion.div key="age" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-4">
                <div className="rounded-2xl p-4"
                  style={{ background: 'rgba(91,106,245,0.07)', border: '1px solid rgba(91,106,245,0.18)' }}>
                  <p className="text-sm text-white/80 leading-relaxed">
                    Under India's <strong className="text-white">DPDP Act 2023</strong>, we need to know your age to apply the correct data protections. This is required by law.
                  </p>
                </div>

                <p className="text-sm font-semibold text-white/60 text-center">How old are you?</p>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button whileTap={{ scale: 0.97 }}
                    onClick={() => { setIsMinor(false); setStep('consent'); }}
                    className="py-4 rounded-2xl flex flex-col items-center gap-2"
                    style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                    <User size={24} className="text-white/60" />
                    <span className="font-bold text-white text-sm">18 or older</span>
                    <span className="text-xs text-white/40">Adult user</span>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }}
                    onClick={() => { setIsMinor(true); setStep('consent'); }}
                    className="py-4 rounded-2xl flex flex-col items-center gap-2"
                    style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                    <Users size={24} className="text-white/60" />
                    <span className="font-bold text-white text-sm">Under 18</span>
                    <span className="text-xs text-white/40">Minor student</span>
                  </motion.button>
                </div>

                {isMinor && (
                  <div className="rounded-xl px-4 py-3 flex items-start gap-2"
                    style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    <AlertTriangle size={14} style={{ color: '#FBBF24', flexShrink: 0, marginTop: 2 }} />
                    <p className="text-xs text-white/60">
                      If you are under 18, a parent or guardian must provide verifiable consent under Section 9 of the DPDP Act.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 2: Consent Checkboxes ── */}
            {step === 'consent' && (
              <motion.div key="consent" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-4">

                {isMinor && (
                  <div className="rounded-xl px-4 py-3 flex items-start gap-2"
                    style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    <AlertTriangle size={14} style={{ color: '#FBBF24', flexShrink: 0, marginTop: 2 }} />
                    <p className="text-xs text-white/60">
                      You indicated you're under 18. We apply enhanced protections for your data and will request parental consent.
                    </p>
                  </div>
                )}

                <p className="text-xs text-white/40 uppercase tracking-wide font-semibold">
                  Please read and accept each item:
                </p>

                {/* Consent item 1 */}
                <ConsentItem
                  checked={checked.processing}
                  onChange={v => setChecked(c => ({ ...c, processing: v }))}
                  icon={Lock}
                  title="Data Processing"
                  body="Edora collects your name, email, study data (quiz results, chat history, learning progress) to provide the service. Your data is stored on Supabase servers in the EU. We will never sell your data."
                />

                {/* Consent item 2 */}
                <ConsentItem
                  checked={checked.rights}
                  onChange={v => setChecked(c => ({ ...c, rights: v }))}
                  icon={Shield}
                  title="Your Data Rights"
                  body="You have the right to access, correct, and erase your data at any time from Settings → Data Rights. You may withdraw consent by deleting your account. DPO contact: dpo@edora.app"
                />

                {/* Consent item 3 */}
                <ConsentItem
                  checked={checked.ai}
                  onChange={v => setChecked(c => ({ ...c, ai: v }))}
                  icon={Users}
                  title="AI & Personalisation"
                  body="Your study interactions help personalise Novo AI's responses for you. Aggregated, anonymised data may be used to improve the AI model. Individual responses are never shared."
                />

                <div className="text-xs text-white/30 text-center">
                  By accepting, you agree to our{' '}
                  <Link to="/privacy" className="underline text-white/50">Privacy Policy</Link>{' '}
                  and{' '}
                  <Link to="/terms" className="underline text-white/50">Terms of Service</Link>.
                  This consent is versioned ({CONSENT_VERSION}) and can be reviewed at any time.
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={isMinor ? () => setStep('parental') : acceptConsent}
                  disabled={!allChecked || saving}
                  className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
                  style={{
                    background: allChecked ? 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' : 'var(--ink-060)',
                    color: allChecked ? '#fff' : 'var(--ink-250)',
                    transition: 'all 0.2s' }}>
                  {saving ? 'Saving…' : isMinor ? <>Next <ChevronRight size={16} /></> : <>Accept & Continue <ChevronRight size={16} /></>}
                </motion.button>
              </motion.div>
            )}

            {/* ── Step 3: Parental Consent (minors only) ── */}
            {step === 'parental' && (
              <motion.div key="parental" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-4">
                <div className="rounded-2xl p-4"
                  style={{ background: 'rgba(91,106,245,0.07)', border: '1px solid rgba(91,106,245,0.18)' }}>
                  <p className="text-sm text-white/70 leading-relaxed">
                    Under <strong className="text-white">DPDP Act Section 9</strong>, processing of children's data requires verifiable parental consent. Please provide your parent or guardian's email.
                  </p>
                </div>

                {!parentSent ? (
                  <>
                    <label className="text-xs text-white/40 font-semibold uppercase tracking-wide">
                      Parent / Guardian Email
                    </label>
                    <input
                      type="email"
                      value={parentEmail}
                      onChange={e => setParentEmail(e.target.value)}
                      placeholder="parent@example.com"
                      className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none"
                      style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-120)' }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }}
                      onClick={sendParentalConsent}
                      disabled={!parentEmail.trim() || saving}
                      className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
                      style={{
                        background: parentEmail.trim() ? 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' : 'var(--ink-060)',
                        color: parentEmail.trim() ? '#fff' : 'var(--ink-250)' }}>
                      {saving ? 'Sending…' : 'Send Consent Request'}
                    </motion.button>
                    <button onClick={acceptConsent}
                      className="text-xs text-white/30 text-center hover:text-white/50 transition-colors py-1">
                      My parent is present — accept on their behalf
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}>
                      <Check size={26} className="text-green-400" />
                    </div>
                    <p className="text-sm text-white/70 text-center">
                      Consent request sent to <strong className="text-white">{parentEmail}</strong>.
                      Your parent will receive an email to approve your account.
                    </p>
                    <button onClick={acceptConsent}
                      className="text-xs text-white/40 hover:text-white/60 transition-colors">
                      Continue to Edora while we wait
                    </button>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function ConsentItem({
  checked, onChange, icon: Icon, title, body }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 text-left p-4 rounded-2xl transition-all w-full"
      style={{
        background: checked ? 'rgba(91,106,245,0.1)' : 'var(--ink-040)',
        border: `1px solid ${checked ? 'rgba(91,106,245,0.35)' : 'var(--ink-080)'}` }}>
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all"
        style={{ background: checked ? '#5B6AF5' : 'var(--ink-100)', border: `1px solid ${checked ? '#5B6AF5' : 'var(--ink-200)'}` }}>
        {checked && <Check size={12} className="text-white" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon size={13} style={{ color: checked ? '#A0AEFF' : 'var(--ink-400)' }} />
          <span className="text-xs font-bold text-white">{title}</span>
        </div>
        <p className="text-xs text-white/40 leading-relaxed">{body}</p>
      </div>
    </button>
  );
}
