// ═══════════════════════════════════════════════════════════════════════════
// DataRightsPage — DPDP Act 2023 Data Principal Rights
// Route: /data-rights
// Covers: view consent, request erasure, request export, correct data
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Shield, Download, Trash2, Edit3,
  CheckCircle2, Loader2, AlertTriangle, Mail, Clock,
  FileText, Lock, User,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics';
import { Toast } from '@capacitor/toast';

type ActionStatus = 'idle' | 'loading' | 'done' | 'error';

export default function DataRightsPage() {
  const { user, profile } = useAuth();
  const navigate           = useNavigate();

  const [exportStatus,  setExportStatus]  = useState<ActionStatus>('idle');
  const [deleteStatus,  setDeleteStatus]  = useState<ActionStatus>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput,   setDeleteInput]   = useState('');

  const consentDate = profile?.dpdp_consent_at
    ? new Date(profile.dpdp_consent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Not recorded';

  async function requestExport() {
    if (!user) return;
    setExportStatus('loading');
    try {
      const { data, error } = await supabase.functions.invoke('export-user-data', {
        body: { user_id: user.id },
      });
      if (error) throw error;
      // data contains a signed URL — open it
      if (data?.url) {
        const a = document.createElement('a');
        a.href = data.url;
        a.download = 'edora_my_data.json';
        a.click();
      }
      setExportStatus('done');
      track('data_export_requested');
      await Toast.show({ text: 'Your data export has been prepared.', duration: 'long' });
    } catch {
      setExportStatus('error');
    }
  }

  async function requestDeletion() {
    if (!user || deleteInput !== 'DELETE') return;
    setDeleteStatus('loading');
    try {
      await supabase.functions.invoke('delete-account', {
        body: { user_id: user.id },
      });
      setDeleteStatus('done');
      track('account_deletion_requested');
      await Toast.show({ text: 'Account deletion scheduled. You will receive a confirmation email.', duration: 'long' });
      setTimeout(() => navigate('/'), 3000);
    } catch {
      setDeleteStatus('error');
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'transparent' }}>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(64px)' }}>
        <Link to="/account" className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Data & Privacy Rights</h2>
          <p className="text-xs text-white/40">DPDP Act 2023 · Your rights as a Data Principal</p>
        </div>
        <Shield size={18} style={{ color: '#5B6AF5' }} />
      </div>

      <div className="flex-1 overflow-y-auto pb-nav px-4 pt-4 flex flex-col gap-4">

        {/* Consent Status */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(91,106,245,0.07)', border: '1px solid rgba(91,106,245,0.2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} style={{ color: profile?.dpdp_consent_at ? '#34D399' : '#F59E0B' }} />
            <span className="text-sm font-bold text-white">Consent Status</span>
          </div>
          <div className="flex flex-col gap-2">
            <Row label="Consent version" value={profile?.dpdp_consent_version ?? 'Not recorded'} />
            <Row label="Consent date" value={consentDate} />
            <Row label="Account type" value="Student" />
            <Row label="Data location" value="Supabase EU (Frankfurt)" />
            <Row label="DPO contact" value="dpo@edora.app" />
          </div>
        </div>

        {/* Rights Section */}
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Your Rights under DPDP Act 2023</p>
          <div className="flex flex-col gap-2">

            {/* Right to Access / Export */}
            <RightCard
              icon={Download}
              title="Right to Access (Section 11)"
              desc="Download a copy of all personal data Edora holds about you — profile, quiz history, chat logs, and study data."
              color="#5B6AF5">
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={requestExport}
                disabled={exportStatus === 'loading' || exportStatus === 'done'}
                className="mt-3 w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)', color: '#A0AEFF' }}>
                {exportStatus === 'loading' && <Loader2 size={14} className="animate-spin" />}
                {exportStatus === 'done' && <CheckCircle2 size={14} />}
                {exportStatus === 'idle' && <Download size={14} />}
                {exportStatus === 'loading' ? 'Preparing export…' : exportStatus === 'done' ? 'Export ready' : 'Download My Data'}
              </motion.button>
            </RightCard>

            {/* Right to Correction */}
            <RightCard
              icon={Edit3}
              title="Right to Correction (Section 12)"
              desc="Update or correct any inaccurate personal information in your profile."
              color="#34D399">
              <Link to="/account"
                className="mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34D399' }}>
                <Edit3 size={14} /> Edit Profile
              </Link>
            </RightCard>

            {/* Right to Erasure */}
            <RightCard
              icon={Trash2}
              title="Right to Erasure (Section 13)"
              desc="Permanently delete your account and all associated data. This action is irreversible and will be completed within 30 days per DPDP Act requirements."
              color="#EF4444">
              {!confirmDelete ? (
                <motion.button whileTap={{ scale: 0.97 }}
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
                  <Trash2 size={14} /> Request Account Deletion
                </motion.button>
              ) : (
                <AnimatePresence>
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 flex flex-col gap-2">
                    <div className="rounded-xl px-3 py-2 flex items-start gap-2"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-300/80">
                        Type <strong>DELETE</strong> to confirm. All your data — progress, streaks, certificates — will be permanently erased.
                      </p>
                    </div>
                    <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(239,68,68,0.3)' }} />
                    <div className="flex gap-2">
                      <button onClick={() => { setConfirmDelete(false); setDeleteInput(''); }}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-white/50"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Cancel
                      </button>
                      <motion.button whileTap={{ scale: 0.97 }}
                        onClick={requestDeletion}
                        disabled={deleteInput !== 'DELETE' || deleteStatus === 'loading'}
                        className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1"
                        style={{
                          background: deleteInput === 'DELETE' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${deleteInput === 'DELETE' ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.07)'}`,
                          color: deleteInput === 'DELETE' ? '#F87171' : 'rgba(255,255,255,0.2)',
                        }}>
                        {deleteStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {deleteStatus === 'loading' ? 'Deleting…' : deleteStatus === 'done' ? 'Requested' : 'Delete'}
                      </motion.button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}
            </RightCard>

            {/* Withdraw Consent */}
            <RightCard
              icon={Lock}
              title="Right to Withdraw Consent (Section 7)"
              desc="You may withdraw consent at any time. Withdrawing consent means we cannot provide the service, which requires account deletion."
              color="#F59E0B">
              <a href="mailto:dpo@edora.app?subject=Consent%20Withdrawal%20Request"
                className="mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#FBBF24' }}>
                <Mail size={14} /> Contact DPO: dpo@edora.app
              </a>
            </RightCard>

          </div>
        </div>

        {/* Grievance / DPO */}
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Grievance Redressal</p>
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            If you believe your data rights under the DPDP Act 2023 have been violated, you may file a complaint with the <strong className="text-white/70">Data Protection Board of India</strong> after exhausting our internal grievance mechanism.
          </p>
          <div className="flex flex-col gap-1.5">
            <Row label="Data Protection Officer" value="Edora Technologies Pvt. Ltd." />
            <Row label="DPO Email" value="dpo@edora.app" />
            <Row label="Response SLA" value="72 hours" />
            <Row label="Erasure SLA" value="30 days" />
          </div>
        </div>

        <p className="text-center text-[10px] text-white/20 pb-4">
          Edora is committed to the Digital Personal Data Protection Act 2023.
          Policy version: {profile?.dpdp_consent_version ?? 'v2026.06'}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs text-white/70 font-semibold text-right">{value}</span>
    </div>
  );
}

function RightCard({ icon: Icon, title, desc, color, children }: {
  icon: React.ElementType; title: string; desc: string; color: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white mb-1">{title}</p>
          <p className="text-xs text-white/45 leading-relaxed">{desc}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
