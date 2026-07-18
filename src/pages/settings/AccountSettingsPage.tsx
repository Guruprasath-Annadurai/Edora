import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, ChevronLeft, Save, Trash2, AlertTriangle, ExternalLink, Sparkles, Languages, BarChart2, Download, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { LanguageSelector } from '@/components/LanguageSelector';
import posthog from 'posthog-js';
import { reindexAllUserContent, getUserIndexStatus } from '@/lib/userContentIndex';

const STUDY_LEVELS = [
  { value: 'school',   label: 'School (Class 6–12)' },
  { value: 'college',  label: 'College / UG'         },
  { value: 'jee_neet', label: 'JEE / NEET'           },
  { value: 'sat_act',  label: 'SAT / ACT'             },
];

export default function AccountSettingsPage() {
  const { profile, signOut, refetchProfile } = useAuth();
  const navigate = useNavigate();

  const [name,      setName]      = useState(profile?.full_name ?? '');
  const [level,     setLevel]     = useState<'school' | 'college' | 'jee_neet' | 'sat_act'>(profile?.study_level ?? 'school');
  const [examName,  setExamName]  = useState(profile?.exam_name ?? '');
  const [examDate,  setExamDate]  = useState(profile?.exam_date ?? '');
  const [saving,    setSaving]    = useState(false);
  const [showDelete,   setShowDelete]   = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [indexStatus,  setIndexStatus]  = useState<{ flashcards_total: number; notes_total: number; indexed_total: number } | null>(null);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(
    () => localStorage.getItem('edora_analytics_opt_out') !== 'true'
  );

  useEffect(() => {
    getUserIndexStatus().then(setIndexStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (analyticsEnabled) {
      posthog.opt_in_capturing();
      localStorage.removeItem('edora_analytics_opt_out');
    } else {
      posthog.opt_out_capturing();
      localStorage.setItem('edora_analytics_opt_out', 'true');
    }
  }, [analyticsEnabled]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name:  name.trim(),
        study_level: level,
        exam_name:  examName.trim() || null,
        exam_date:  examDate || null })
      .eq('id', profile.id);
    if (error) {
      await Toast.show({ text: 'Failed to save changes', duration: 'short', position: 'bottom' });
    } else {
      await refetchProfile();
      await Toast.show({ text: 'Profile updated!', duration: 'short', position: 'bottom' });
    }
    setSaving(false);
  }

  async function exportData() {
    if (!profile) return;
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('export-user-data', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
      if (res.error) throw res.error;
      // Trigger browser / native file save
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `edora-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await Toast.show({ text: 'Your data export has been downloaded.', duration: 'long', position: 'bottom' });
    } catch {
      await Toast.show({ text: 'Export failed. Please try again.', duration: 'short', position: 'bottom'});
    } finally {
      setExporting(false);
    }
  }

  async function syncNotes() {
    setSyncing(true);
    try {
      const result = await reindexAllUserContent();
      setIndexStatus(await getUserIndexStatus().catch(() => null) ?? indexStatus);
      await Toast.show({ text: `Synced ${result.indexed} items (${result.embedded} embedded).`, duration: 'long', position: 'bottom' });
    } catch {
      await Toast.show({ text: 'Sync failed. Please try again.', duration: 'short', position: 'bottom' });
    } finally {
      setSyncing(false);
    }
  }

  async function deleteAccount() {
    if (!profile) return;
    setDeleting(true);
    try {
      // Call the delete-account Edge Function which uses the service role
      // to properly delete the Supabase Auth user (not possible from the client SDK).
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('delete-account', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {} });
      if (res.error) throw res.error;
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      await Toast.show({ text: 'Failed to delete account. Please try again.', duration: 'short', position: 'bottom'});
      setDeleting(false);
      setShowDelete(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/profile"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <User size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Account Settings</h2>
          <p className="text-xs text-muted-foreground">Manage your profile</p>
        </div>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-5 flex flex-col gap-5">

        {/* Email (read-only) */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Email</p>
          <div className="bg-secondary border border-border rounded-2xl px-4 h-12 flex items-center">
            <span className="text-sm text-muted-foreground">{profile?.email}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 px-1">Email cannot be changed here</p>
        </motion.div>

        {/* Display name */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Display Name</p>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Your full name" aria-label="Display name"
            className="rounded-2xl px-4 h-12 text-white placeholder:text-white/30 outline-none w-full text-sm"
            style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }} />
        </motion.div>

        {/* Study level */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Study Level</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Study level">
            {STUDY_LEVELS.map(({ value, label }) => (
              <button key={value} onClick={() => setLevel(value as 'school' | 'college' | 'jee_neet' | 'sat_act')}
                role="radio" aria-checked={level === value}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left"
                style={level === value
                  ? { background: 'rgba(91,106,245,0.15)', borderColor: 'rgba(91,106,245,0.5)' }
                  : { background: 'var(--ink-055)', borderColor: 'var(--ink-080)' }}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all
                  ${level === value ? 'border-primary' : 'border-border'}`}>
                  {level === value && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <span className={`text-sm font-medium ${level === value ? 'text-primary' : 'text-foreground'}`}>{label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Exam countdown */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Exam Countdown</p>
          <div className="flex flex-col gap-2">
            <input type="text" value={examName} onChange={e => setExamName(e.target.value)}
              placeholder="Exam name (e.g. JEE Main, NEET, SAT)" aria-label="Exam name"
              className="rounded-2xl px-4 h-12 text-white placeholder:text-white/30 outline-none w-full text-sm"
              style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }} />
            <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              aria-label="Exam date"
              className="rounded-2xl px-4 h-12 text-white outline-none w-full text-sm"
              style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-080)', colorScheme: 'dark' }} />
            <p className="text-xs text-muted-foreground px-1">Shows a countdown on your home screen</p>
          </div>
        </motion.div>

        <Button size="lg" onClick={save} disabled={saving || !name.trim()} className="w-full">
          <Save size={17} /> {saving ? 'Saving…' : 'Save Changes'}
        </Button>

        {/* Language preference */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
          <div className="flex items-center gap-2 mb-3">
            <Languages size={15} className="text-primary" />
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Preferred Language</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3 px-1">
            Novo will reply in your chosen language. You can still ask questions in English.
          </p>
          <LanguageSelector />
        </motion.div>

        {/* About & Legal */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Sparkles size={15} className="text-primary" />
            <p className="font-semibold text-white text-sm">About Edora</p>
          </div>
          <div className="px-4 pb-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Edora uses <strong className="text-white/70">AI-generated content</strong> throughout the app — including tutoring explanations,
              quiz questions, flashcards, study summaries, and voice responses. AI content is for educational
              practice only and may not always be 100% accurate. Always verify important information with
              authoritative sources.
            </p>
          </div>
          <button
            onClick={() => Browser.open({ url: 'https://edora-app.vercel.app/privacy-policy', presentationStyle: 'popover' })}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid var(--ink-070)' }}>
            <span className="text-sm font-medium text-white/80">Privacy Policy</span>
            <ExternalLink size={15} className="text-muted-foreground" />
          </button>
          <Link to="/data-rights"
            className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid var(--ink-070)' }}>
            <span className="text-sm font-medium text-white/80">Data & Privacy Rights (DPDP)</span>
            <ExternalLink size={15} className="text-muted-foreground" />
          </Link>
          <div
            className="w-full flex items-center justify-between px-4 py-3"
            style={{ borderTop: '1px solid var(--ink-070)' }}>
            <div className="flex items-center gap-2">
              <BarChart2 size={15} className="text-muted-foreground" />
              <span className="text-sm font-medium text-white/80">Analytics & Crash Reporting</span>
            </div>
            <button
              onClick={() => setAnalyticsEnabled(v => !v)}
              className="relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none"
              style={{ background: analyticsEnabled ? '#5B6AF5' : 'var(--ink-150)' }}
              aria-label={analyticsEnabled ? 'Disable analytics' : 'Enable analytics'}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: analyticsEnabled ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
          <button
            onClick={() => Browser.open({ url: 'https://edora-app.vercel.app/terms-of-service', presentationStyle: 'popover' })}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid var(--ink-070)' }}>
            <span className="text-sm font-medium text-white/80">Terms of Service</span>
            <ExternalLink size={15} className="text-muted-foreground" />
          </button>
        </motion.div>

        {/* Data export — DPDP Act 2023 right to portability */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.155 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Download size={15} className="text-primary" />
            <p className="font-semibold text-white text-sm">Your Data</p>
          </div>
          <div className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Download all your quiz history, progress, flashcard reviews, and profile data in JSON format.
              Your right under the <strong className="text-white/70">DPDP Act 2023</strong>.
            </p>
            <button onClick={exportData} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-primary active:opacity-70 disabled:opacity-50 transition-opacity"
              style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)' }}>
              <Download size={15} />
              {exporting ? 'Preparing export…' : 'Export my data'}
            </button>
          </div>
        </motion.div>

        {/* Novo AI index — sync notes + flashcards */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <RefreshCw size={15} className="text-emerald-400" />
            <p className="font-semibold text-white text-sm">Novo AI Index</p>
          </div>
          <div className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1 leading-relaxed">
              Keeps Novo's memory of your notes and flashcards fresh so it can reference them in chat.
            </p>
            {indexStatus && (
              <p className="text-xs text-white/40 mb-3">
                {indexStatus.indexed_total} / {indexStatus.flashcards_total + indexStatus.notes_total} items indexed
              </p>
            )}
            <button onClick={syncNotes} disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-emerald-400 active:opacity-70 disabled:opacity-50 transition-opacity"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync my notes'}
            </button>
          </div>
        </motion.div>

        {/* Danger zone */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="px-4 pt-4 pb-3">
            <p className="font-semibold text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle size={15} /> Danger Zone
            </p>
            <p className="text-xs text-red-400/70 mt-1">Permanently delete your account and all data. This cannot be undone.</p>
          </div>
          {!showDelete ? (
            <div className="px-4 pb-4">
              <button onClick={() => setShowDelete(true)}
                className="text-sm font-semibold text-red-500 underline underline-offset-2">
                Delete my account
              </button>
            </div>
          ) : (
            <div className="px-4 pb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-red-500">Are you absolutely sure?</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowDelete(false)} className="flex-1 text-xs">Cancel</Button>
                <button onClick={deleteAccount} disabled={deleting}
                  className="flex-1 py-2.5 rounded-2xl bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                  <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        <div className="h-4" />
      </div>
    </div>
  );
}
