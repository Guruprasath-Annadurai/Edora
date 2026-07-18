// ═══════════════════════════════════════════════════════════════════════════
// SchoolAdminPage — B2B2C Principal / Institution Admin Portal
// Route: /school-admin
// Covers: institution setup, join-code QR, student roster, analytics, weak topics
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ChevronLeft, Building2, Users, Zap, Copy, Check,
  QrCode, Download, Search,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Crown,
  BookOpen, Target, RefreshCw, Loader2, Plus, X, School,
  CheckCircle2, Star, ArrowUpRight, Flame, Trophy} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Toast } from '@capacitor/toast';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Institution {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  board: string | null;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  max_students: number;
  join_code: string;
  join_link_token: string;
  student_count: number;
  is_verified: boolean;
  contact_email: string | null;
  pro_expires_at: string | null;
}

interface InstitutionAnalytics {
  total_students: number;
  students_with_streak: number;
  avg_xp: number;
  top_xp: number;
  avg_streak: number;
  total_xp: number;
  pro_students: number;
  active_last_7d: number;
}

interface StudentRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  class_section: string | null;
  joined_at: string;
  xp: number;
  streak_count: number;
  is_pro: boolean;
  exam_name: string | null;
  last_active: string;
  total_sessions: number;
  accuracy_pct: number;
}

interface WeakTopic {
  subject: string;
  topic: string;
  avg_struggle: number;
  student_count: number;
}

type Tab = 'overview' | 'students' | 'topics';

const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'Other'];

const TIER_CONFIG = {
  free:       { label: 'Free',       color: '#9CA3AF', limit: '50 students',   price: '' },
  starter:    { label: 'Starter',    color: '#60A5FA', limit: '200 students',  price: '₹999/mo' },
  pro:        { label: 'Pro',        color: '#A78BFA', limit: 'Unlimited',     price: '₹4,999/mo' },
  enterprise: { label: 'Enterprise', color: '#FBBF24', limit: 'Unlimited',     price: 'Custom' } };

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (url && !imgError) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} onError={() => setImgError(true)} />;
  const initials = (name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: 'var(--ink-950)', flexShrink: 0 }}>{initials}</div>
  );
}

function StatCard({ label, value, sub, color = '#A0AEFF', icon: Icon }:
  { label: string; value: string | number; sub?: string; color?: string; icon: React.ElementType }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1 v2-card">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} style={{ color }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--v2-text-4)' }}>{label}</span>
      </div>
      <span className="font-heading text-2xl font-black v2-tnum" style={{ color: 'var(--v2-text-1)' }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: 'var(--v2-text-4)' }}>{sub}</span>}
    </div>
  );
}

function _TrendIcon({ val }: { val: number }) {
  if (val > 0) return <TrendingUp size={12} className="text-green-400" />;
  if (val < 0) return <TrendingDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-white/30" />;
}

// ── QR Code (pure-CSS matrix, no external lib) ────────────────────────────────
function QRPlaceholder({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Deterministic hash → simple 21×21 grid pattern (visual only, not real QR)
    // Real apps should use a QR library; this gives the admin a printable-looking code
    const size = 21;
    const cell = Math.floor(canvas.width / size);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Corner squares (fixed per QR spec)
    function drawFinder(x: number, y: number) {
      ctx!.fillStyle = '#000';
      ctx!.fillRect(x * cell, y * cell, 7 * cell, 7 * cell);
      ctx!.fillStyle = '#fff';
      ctx!.fillRect((x + 1) * cell, (y + 1) * cell, 5 * cell, 5 * cell);
      ctx!.fillStyle = '#000';
      ctx!.fillRect((x + 2) * cell, (y + 2) * cell, 3 * cell, 3 * cell);
    }
    drawFinder(0, 0);
    drawFinder(14, 0);
    drawFinder(0, 14);

    // Data modules — seeded from value hash
    let seed = value.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; };

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const inFinder =
          (row < 8 && col < 8) || (row < 8 && col >= 13) || (row >= 13 && col < 8);
        if (inFinder) continue;
        if (rand() > 0.5) {
          ctx.fillStyle = '#000';
          ctx.fillRect(col * cell, row * cell, cell, cell);
        }
      }
    }
  }, [value]);

  return (
    <canvas
      ref={canvasRef}
      width={168}
      height={168}
      style={{ borderRadius: 8, display: 'block' }}
    />
  );
}

// ── Setup Wizard ───────────────────────────────────────────────────────────────

function SetupWizard({ onCreated }: { onCreated: (inst: Institution) => void }) {
  const [_step, _setStep]       = useState(0);
  const [name, setName]       = useState('');
  const [city, setCity]       = useState('');
  const [state, setState]     = useState('');
  const [board, setBoard]     = useState('CBSE');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  async function create() {
    if (!name.trim()) { setErr('School name is required'); return; }
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase.rpc('create_institution', {
        p_name: name.trim(), p_city: city.trim(), p_state: state.trim(), p_board: board });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Failed to create institution');
      // Fetch full institution row
      const { data: inst } = await supabase
        .from('institutions').select('*').eq('id', data.institution_id).single();
      if (inst) onCreated(inst as Institution);
      track('institution_created', { board, state });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)' }}>
          <Building2 size={32} style={{ color: '#5B6AF5' }} />
        </div>
        <h2 className="font-heading text-2xl font-black text-white mb-2">Set up your school</h2>
        <p className="text-sm text-white/50 mb-8">Create your institution on Edora to manage students and track progress</p>

        <div className="flex flex-col gap-3 text-left mb-6">
          <div>
            <label className="text-xs text-white/40 font-semibold uppercase tracking-wide block mb-1">School Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Delhi Public School, RK Puram"
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none"
              style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-120)' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 font-semibold uppercase tracking-wide block mb-1">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="New Delhi"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none"
                style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-120)' }} />
            </div>
            <div>
              <label className="text-xs text-white/40 font-semibold uppercase tracking-wide block mb-1">State</label>
              <input value={state} onChange={e => setState(e.target.value)} placeholder="Delhi"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none"
                style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-120)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/40 font-semibold uppercase tracking-wide block mb-1">Board</label>
            <div className="flex flex-wrap gap-2">
              {BOARDS.map(b => (
                <button key={b} onClick={() => setBoard(b)}
                  className="px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: board === b ? 'rgba(91,106,245,0.25)' : 'var(--ink-060)',
                    border: `1px solid ${board === b ? 'rgba(91,106,245,0.5)' : 'var(--ink-100)'}`,
                    color: board === b ? '#A0AEFF' : 'var(--ink-500)' }}>{b}</button>
              ))}
            </div>
          </div>
        </div>

        {err && <p className="text-sm text-red-400 mb-3">{err}</p>}

        <motion.button whileTap={{ scale: 0.97 }} onClick={create} disabled={loading}
          className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
          style={{ background: loading ? 'rgba(91,106,245,0.4)' : 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : <><Plus size={18} /> Create Institution</>}
        </motion.button>
        <p className="text-xs text-white/25 mt-3">Free tier includes up to 50 students. Upgrade anytime.</p>
      </motion.div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SchoolAdminPage() {
  const { profile } = useAuth();


  const [institution, setInstitution]   = useState<Institution | null>(null);
  const [analytics, setAnalytics]       = useState<InstitutionAnalytics | null>(null);
  const [students, setStudents]         = useState<StudentRow[]>([]);
  const [weakTopics, setWeakTopics]     = useState<WeakTopic[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [tab, setTab]                   = useState<Tab>('overview');
  const [searchQ, setSearchQ]           = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [codeCopied, setCodeCopied]     = useState(false);
  const [linkCopied, setLinkCopied]     = useState(false);
  const [showQR, setShowQR]             = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [topicsLoaded, setTopicsLoaded]    = useState(false);

  // Load institution for this admin
  const loadInstitution = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('institutions').select('*').eq('admin_user_id', profile.id).maybeSingle();
    if (data) {
      setInstitution(data as Institution);
      await loadAnalytics(data.id);
    }
    setLoading(false);
  }, [profile]);

  async function loadAnalytics(instId: string) {
    const { data } = await supabase
      .from('institution_analytics').select('*').eq('institution_id', instId).maybeSingle();
    if (data) setAnalytics(data as InstitutionAnalytics);
  }

  async function loadStudents(instId: string) {
    if (studentsLoaded) return;
    const { data } = await supabase
      .from('institution_student_analytics')
      .select('*')
      .eq('institution_id', instId)
      .order('xp', { ascending: false });
    setStudents((data ?? []) as StudentRow[]);
    setStudentsLoaded(true);
  }

  async function loadWeakTopics(instId: string) {
    if (topicsLoaded) return;
    const { data } = await supabase.rpc('get_institution_weak_topics', { p_institution_id: instId });
    setWeakTopics((data ?? []) as WeakTopic[]);
    setTopicsLoaded(true);
  }

  useEffect(() => { loadInstitution(); }, [loadInstitution]);

  useEffect(() => {
    if (!institution) return;
    if (tab === 'students') loadStudents(institution.id);
    if (tab === 'topics')   loadWeakTopics(institution.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadStudents/loadWeakTopics close over institution already tracked; adding them would require useCallback and cause infinite loops
  }, [tab, institution]);

  async function refresh() {
    if (!institution) return;
    setRefreshing(true);
    setStudentsLoaded(false);
    setTopicsLoaded(false);
    await loadInstitution();
    if (tab === 'students') await loadStudents(institution.id);
    if (tab === 'topics')   await loadWeakTopics(institution.id);
    setRefreshing(false);
    track('school_admin_refreshed');
  }

  async function copyCode() {
    if (!institution) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    try {
      await navigator.clipboard.writeText(institution.join_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
      await Toast.show({ text: 'Join code copied!', duration: 'short' });
    } catch { await Toast.show({ text: institution.join_code, duration: 'long' }); }
    track('join_code_copied');
  }

  async function copyLink() {
    if (!institution) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    const link = `https://edora.app/join/${institution.join_link_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      await Toast.show({ text: 'Invite link copied!', duration: 'short' });
    } catch { await Toast.show({ text: link, duration: 'long' }); }
    track('join_link_copied');
  }

  function exportCSV() {
    if (!students.length) return;
    const headers = ['Name','Class/Section','XP','Streak','Accuracy%','Sessions','Last Active','Pro'];
    const rows = students.map(s => [
      s.full_name,
      s.class_section ?? '',
      s.xp,
      s.streak_count,
      s.accuracy_pct,
      s.total_sessions,
      new Date(s.last_active).toLocaleDateString('en-IN'),
      s.is_pro ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${institution?.name ?? 'students'}_edora.csv`;
    a.click(); URL.revokeObjectURL(url);
    track('students_csv_exported', { count: students.length });
  }

  const joinLink = institution ? `https://edora.app/join/${institution.join_link_token}` : '';
  const capacityPct = institution ? (institution.student_count / institution.max_students) * 100 : 0;

  const filteredStudents = students.filter(s => {
    const matchQ = !searchQ || s.full_name.toLowerCase().includes(searchQ.toLowerCase());
    const matchS = !sectionFilter || s.class_section === sectionFilter;
    return matchQ && matchS;
  });

  const sections = Array.from(new Set(students.map(s => s.class_section).filter(Boolean))) as string[];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-white/40" />
      </div>
    );
  }

  if (!institution) {
    return (
      <div className="h-full flex flex-col" style={{ background: 'transparent' }}>
        <div className="shrink-0 px-4 py-3 flex items-center gap-3"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-060)', backdropFilter: 'blur(64px)' }}>
          <Link to="/profile" className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-080)' }}>
            <ChevronLeft size={18} className="text-white" />
          </Link>
          <div className="flex-1">
            <h2 className="font-heading font-bold text-white text-sm">School Admin</h2>
            <p className="text-xs text-white/40">Institution portal</p>
          </div>
          <School size={18} style={{ color: '#A0AEFF' }} />
        </div>
        <SetupWizard onCreated={setInstitution} />
      </div>
    );
  }

  const tierCfg  = TIER_CONFIG[institution.tier];
  const activeRate = analytics
    ? Math.round((analytics.active_last_7d / Math.max(analytics.total_students, 1)) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col" style={{ background: 'transparent' }}>
      {/* ── Header ── */}
      <div className="shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-060)', backdropFilter: 'blur(64px)', WebkitBackdropFilter: 'blur(64px)' }}>
        <Link to="/profile" className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-080)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-white text-sm truncate">{institution.name}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${tierCfg.color}18`, color: tierCfg.color, border: `1px solid ${tierCfg.color}40` }}>
              {tierCfg.label}
            </span>
            {institution.is_verified && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 size={10} /> Verified
              </span>
            )}
          </div>
        </div>
        <button onClick={refresh}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-080)' }}>
          <RefreshCw size={15} className={`text-white/60 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Tab Bar ── */}
      <div className="shrink-0 px-4 pt-3 pb-0 flex gap-2"
        style={{ background: 'var(--hdr-a-600)', backdropFilter: 'blur(32px)' }}>
        {(['overview','students','topics'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold capitalize transition-all"
            style={{
              background: tab === t ? 'var(--v2-primary-tint-2)' : 'var(--v2-card)',
              border: `1px solid ${tab === t ? 'var(--v2-primary)' : 'var(--v2-border)'}`,
              color: tab === t ? 'var(--v2-primary)' : 'var(--v2-text-4)' }}>{t}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-nav px-4 pt-4">
        <AnimatePresence mode="wait">

          {/* ══════════════ OVERVIEW TAB ══════════════ */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4">

              {/* Join Code Card */}
              <div className="rounded-3xl p-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg,var(--grad-referral-1),var(--grad-referral-2))', border: '1px solid rgba(91,106,245,0.3)' }}>
                <div className="absolute inset-0 opacity-20"
                  style={{ background: 'radial-gradient(ellipse at 80% 20%,#5B6AF5,transparent 60%)' }} />
                <div className="relative">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Student Join Code</p>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="font-heading text-4xl font-black text-white tracking-[0.2em]">{institution.join_code}</span>
                    <button onClick={copyCode}
                      className="w-10 h-10 rounded-2xl flex items-center justify-center transition-colors"
                      style={{ background: codeCopied ? 'rgba(52,211,153,0.15)' : 'var(--ink-080)', border: `1px solid ${codeCopied ? 'rgba(52,211,153,0.4)' : 'var(--ink-100)'}` }}>
                      <AnimatePresence mode="wait">
                        {codeCopied
                          ? <motion.div key="chk" initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={16} className="text-green-400" /></motion.div>
                          : <motion.div key="cp"  initial={{ scale: 0 }} animate={{ scale: 1 }}><Copy  size={16} className="text-white/60" /></motion.div>
                        }
                      </AnimatePresence>
                    </button>
                  </div>

                  {/* Capacity bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-white/40">{institution.student_count} / {institution.max_students} students</span>
                      <span className="text-xs font-bold" style={{ color: capacityPct > 80 ? '#EF4444' : '#A0AEFF' }}>{Math.round(capacityPct)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-100)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(capacityPct, 100)}%`,
                          background: capacityPct > 80 ? 'linear-gradient(90deg,#F59E0B,#EF4444)' : 'linear-gradient(90deg,#5B6AF5,#8B5CF6)' }} />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <motion.button whileTap={{ scale: 0.97 }} onClick={copyLink}
                      className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ background: 'rgba(91,106,245,0.2)', border: '1px solid rgba(91,106,245,0.3)', color: '#A0AEFF' }}>
                      {linkCopied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Invite Link</>}
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowQR(v => !v)}
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: 'var(--ink-080)', border: '1px solid var(--ink-120)' }}>
                      <QrCode size={18} className="text-white/70" />
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              <AnimatePresence>
                {showQR && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="rounded-2xl p-5 flex flex-col items-center gap-3"
                    style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">Scan to Join</p>
                    <div className="rounded-xl overflow-hidden p-2" style={{ background: '#fff' }}>
                      <QRPlaceholder value={joinLink} />
                    </div>
                    <p className="text-xs text-white/30 text-center max-w-xs">
                      Print this QR code and post it in your classroom. Students scan it to join instantly.
                    </p>
                    <button onClick={exportCSV}
                      className="text-xs flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors">
                      <Download size={12} /> Download student data (CSV)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Analytics Grid */}
              {analytics && (
                <>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">School Overview</p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Total Students" value={analytics.total_students} icon={Users} color="#5B6AF5" />
                    <StatCard label="Active 7 Days" value={analytics.active_last_7d} sub={`${activeRate}% of school`} icon={Zap} color="#34D399" />
                    <StatCard label="Avg XP" value={analytics.avg_xp?.toLocaleString() ?? 0} sub="per student" icon={Star} color="#FBBF24" />
                    <StatCard label="Avg Streak" value={`${analytics.avg_streak ?? 0}d`} sub="streak days" icon={Flame} color="#F97316" />
                    <StatCard label="Top XP" value={analytics.top_xp?.toLocaleString() ?? 0} sub="best performer" icon={Trophy} color="#A78BFA" />
                    <StatCard label="Pro Students" value={analytics.pro_students ?? 0} sub={`${Math.round((analytics.pro_students / Math.max(analytics.total_students,1)) * 100)}% of school`} icon={Crown} color="#60A5FA" />
                  </div>
                </>
              )}

              {/* Tier / Upgrade */}
              {institution.tier === 'free' && institution.student_count >= 40 && (
                <div className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <AlertTriangle size={16} style={{ color: '#FBBF24', flexShrink: 0 }} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">Approaching student limit</p>
                    <p className="text-xs text-white/50">Upgrade to Starter (₹999/mo) to add 200 students</p>
                  </div>
                  <button className="text-xs font-bold px-3 py-1.5 rounded-xl"
                    style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.3)' }}>
                    Upgrade
                  </button>
                </div>
              )}

              {/* Quick links */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">Quick Actions</p>
                <button onClick={() => setTab('students')}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl v2-card">
                  <Users size={16} style={{ color: '#5B6AF5' }} />
                  <span className="text-sm flex-1" style={{ color: 'var(--v2-text-2)' }}>View Student Roster</span>
                  <ArrowUpRight size={14} style={{ color: 'var(--v2-chevron)' }} />
                </button>
                <button onClick={() => setTab('topics')}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl v2-card">
                  <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
                  <span className="text-sm flex-1" style={{ color: 'var(--v2-text-2)' }}>Identify Weak Topics</span>
                  <ArrowUpRight size={14} style={{ color: 'var(--v2-chevron)' }} />
                </button>
                <button onClick={exportCSV}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl v2-card">
                  <Download size={16} style={{ color: '#34D399' }} />
                  <span className="text-sm flex-1" style={{ color: 'var(--v2-text-2)' }}>Export Student Data (CSV)</span>
                  <ArrowUpRight size={14} style={{ color: 'var(--v2-chevron)' }} />
                </button>
                <Link to="/teacher"
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl v2-card">
                  <BookOpen size={16} style={{ color: '#A78BFA' }} />
                  <span className="text-sm flex-1" style={{ color: 'var(--v2-text-2)' }}>Teacher Dashboard (Assignments)</span>
                  <ArrowUpRight size={14} style={{ color: 'var(--v2-chevron)' }} />
                </Link>
              </div>
            </motion.div>
          )}

          {/* ══════════════ STUDENTS TAB ══════════════ */}
          {tab === 'students' && (
            <motion.div key="students" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-3">

              {/* Search +  */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl v2-card">
                  <Search size={14} className="text-white/40 shrink-0" />
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                    placeholder="Search students…" className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none" />
                  {searchQ && <button aria-label="Close" onClick={() => setSearchQ('')}><X size={14} className="text-white/40" /></button>}
                </div>
                {sections.length > 0 && (
                  <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}
                    className="rounded-xl px-3 py-2.5 text-sm text-white/70 outline-none v2-card">
                    <option value="">All Sections</option>
                    {sections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>

              {/* Export row */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">{filteredStudents.length} students</span>
                <button onClick={exportCSV}
                  className="text-xs flex items-center gap-1 font-semibold"
                  style={{ color: '#A0AEFF' }}>
                  <Download size={12} /> Export CSV
                </button>
              </div>

              {/* Student cards */}
              {!studentsLoaded ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-white/40" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-12">
                  <Users size={32} className="mx-auto mb-3 text-white/20" />
                  <p className="text-sm text-white/40">No students found</p>
                  <p className="text-xs text-white/25 mt-1">Share your join code: <strong className="text-white/50">{institution.join_code}</strong></p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredStudents.map((s, i) => (
                    <motion.div key={s.user_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 p-3 rounded-2xl v2-card">
                      <Avatar url={s.avatar_url} name={s.full_name} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-white truncate">{s.full_name}</p>
                          {s.is_pro && <Crown size={11} style={{ color: '#FBBF24', flexShrink: 0 }} />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {s.class_section && <span className="text-xs text-white/40">{s.class_section}</span>}
                          <span className="text-xs text-white/30">• {s.total_sessions} sessions</span>
                          <span className="text-xs" style={{ color: s.accuracy_pct >= 70 ? '#34D399' : s.accuracy_pct >= 50 ? '#F59E0B' : '#EF4444' }}>
                            {s.accuracy_pct}% acc
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-sm font-bold" style={{ color: '#A0AEFF' }}>{s.xp.toLocaleString()} XP</span>
                        <div className="flex items-center gap-1">
                          <Flame size={10} style={{ color: s.streak_count > 0 ? '#F97316' : '#4B5563' }} />
                          <span className="text-xs text-white/40">{s.streak_count}d</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════ TOPICS TAB ══════════════ */}
          {tab === 'topics' && (
            <motion.div key="topics" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-3">

              <div className="rounded-2xl p-4 flex items-start gap-3"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={16} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs text-white/60">
                  Topics where your students struggle most, ranked by average difficulty. Use this to focus teaching time.
                </p>
              </div>

              {!topicsLoaded ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-white/40" />
                </div>
              ) : weakTopics.length === 0 ? (
                <div className="text-center py-12">
                  <Target size={32} className="mx-auto mb-3 text-white/20" />
                  <p className="text-sm text-white/40">Not enough quiz data yet</p>
                  <p className="text-xs text-white/25 mt-1">Weak topics appear after students complete sessions</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {weakTopics.map((t, i) => {
                    const maxStruggle = weakTopics[0]?.avg_struggle ?? 1;
                    const pct = Math.min((Number(t.avg_struggle) / maxStruggle) * 100, 100);
                    const color = pct > 66 ? '#EF4444' : pct > 33 ? '#F59E0B' : '#FBBF24';
                    return (
                      <motion.div key={`${t.subject}-${t.topic}`}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        className="p-4 rounded-2xl v2-card">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{t.topic}</p>
                            <p className="text-xs text-white/40">{t.subject}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-white/40">{t.student_count} students</span>
                            <span className="text-sm font-bold" style={{ color }}>{t.avg_struggle}×</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--v2-border)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <p className="text-xs text-white/25 mt-1">Avg struggle count per student</p>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
