import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, ChevronLeft, Save, Trash2, AlertTriangle, ExternalLink, Sparkles, Languages } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { LanguageSelector } from '@/components/LanguageSelector';

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
  const [showDelete, setShowDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name:  name.trim(),
        study_level: level,
        exam_name:  examName.trim() || null,
        exam_date:  examDate || null,
      })
      .eq('id', profile.id);
    if (error) {
      await Toast.show({ text: 'Failed to save changes', duration: 'short', position: 'bottom' });
    } else {
      await refetchProfile();
      await Toast.show({ text: 'Profile updated!', duration: 'short', position: 'bottom' });
    }
    setSaving(false);
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
          : {},
      });
      if (res.error) throw res.error;
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('[deleteAccount]', err);
      await Toast.show({ text: 'Failed to delete account. Please try again.', duration: 'short', position: 'bottom' });
      setDeleting(false);
      setShowDelete(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <Link aria-label="Go back" to="/profile"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
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
            placeholder="Your full name"
            className="rounded-2xl px-4 h-12 text-white placeholder:text-white/30 outline-none w-full text-sm"
            style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)', WebkitUserSelect: 'text', userSelect: 'text' }} />
        </motion.div>

        {/* Study level */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Study Level</p>
          <div className="flex flex-col gap-2">
            {STUDY_LEVELS.map(({ value, label }) => (
              <button key={value} onClick={() => setLevel(value as 'school' | 'college' | 'jee_neet' | 'sat_act')}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left"
                style={level === value
                  ? { background: 'rgba(91,106,245,0.15)', borderColor: 'rgba(91,106,245,0.5)' }
                  : { background: 'rgba(15,20,45,0.7)', borderColor: 'rgba(255,255,255,0.08)' }}>
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
              placeholder="Exam name (e.g. JEE Main, NEET, SAT)"
              className="rounded-2xl px-4 h-12 text-white placeholder:text-white/30 outline-none w-full text-sm"
              style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)', WebkitUserSelect: 'text', userSelect: 'text' }} />
            <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="rounded-2xl px-4 h-12 text-white outline-none w-full text-sm"
              style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)', colorScheme: 'dark' }} />
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
          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
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
            onClick={() => Browser.open({ url: 'https://edora-bb02e.web.app/privacy-policy', presentationStyle: 'popover' })}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-sm font-medium text-white/80">Privacy Policy</span>
            <ExternalLink size={15} className="text-muted-foreground" />
          </button>
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
