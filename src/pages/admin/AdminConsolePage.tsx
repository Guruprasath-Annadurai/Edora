// ═══════════════════════════════════════════════════════════════════════════
// AdminConsolePage — staff-only: schedule Live Events, view audit log
// Route: /admin (server-side gated by has_role(uid,'admin') in admin-console)
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trophy, ShieldAlert, Loader2, X, Search, ChevronLeft, ChevronRight, HelpCircle, Siren, Check as CheckIcon, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface QuestionFlag {
  id: string; question_text: string; subject: string | null; topic: string | null;
  correct_rate: number | null; attempt_count: number; report_count: number;
  verdict: string; reasoning: string; model_used: string; created_at: string;
  sample_options: unknown;
  corrected_question: { question_text: string; options: string[]; correct_index: number; explanation: string } | null;
  correction_bank_id: string | null;
}

// Original options come from whatever shape the source stored them in
// (raw string[], or {text,correct}-style quiz objects) — normalize for display.
function optionLabel(opt: unknown): string {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object' && 'text' in opt) return String((opt as { text: unknown }).text);
  return JSON.stringify(opt);
}
function originalOptionsList(sample: unknown): string[] {
  return Array.isArray(sample) ? sample.map(optionLabel) : [];
}

interface AnomalyFlag {
  id: string; user_id: string; flag_type: string; severity: string;
  reasoning: string; model_used: string; created_at: string;
  evidence: Record<string, unknown>; profiles?: { full_name: string | null };
}

interface PyqContentFlag {
  id: string; exam: string; subject: string; chapter: string; question_text: string;
  options: unknown; correct_option: string | null; solution_text: string | null;
  review_notes: string | null; reviewed_by: string | null; created_at: string;
}

interface MainsSubmission {
  id: string; user_id: string; question_id: string; word_count: number;
  score_band: string; suspected_copy: boolean; copy_overlap_ratio: number | null;
  structure_feedback: string; model_used: string; created_at: string;
  mains_questions?: { exam: string; class_level: string | null; paper: string; topic: string; question_text: string };
  mains_band_overrides?: { override_band: string; note: string | null; created_at: string }[];
}

interface CronHealthRow {
  jobname: string; last_run_at: string | null;
  last_status: 'success' | 'error' | 'inconclusive' | null;
  last_summary: Record<string, unknown> | null;
}

async function callFn(fn: string, action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke(fn, {
    body: { action, ...body },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

interface LiveEventRow {
  id: string; title: string; subject: string; scheduled_at: string;
  status: string; participant_count: number;
}

interface AuditRow {
  id: string; created_at: string; action: string; source: string;
  actor_id: string | null; target_id: string | null; metadata: Record<string, unknown>;
}

interface AdminRow {
  user_id: string; role: string; granted_at: string;
  full_name: string | null; email: string | null;
}

const AUDIT_PAGE_SIZE = 50;

async function callAdminConsole(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke('admin-console', {
    body: { action, ...body },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

export default function AdminConsolePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'events' | 'audit' | 'admins' | 'quality' | 'anomalies' | 'pyqcontent' | 'mainsqa' | 'cronhealth'>('events');
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const [events, setEvents] = useState<LiveEventRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditSourceFilter, setAuditSourceFilter] = useState('');
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [auditSources, setAuditSources] = useState<string[]>([]);

  const [admins, setAdmins] = useState<AdminRow[]>([]);

  const [qFlags, setQFlags] = useState<QuestionFlag[]>([]);
  const [qFlagsLoading, setQFlagsLoading] = useState(false);
  const [qFlagsRunning, setQFlagsRunning] = useState(false);

  const [anomFlags, setAnomFlags] = useState<AnomalyFlag[]>([]);
  const [anomLoading, setAnomLoading] = useState(false);
  const [anomRunning, setAnomRunning] = useState(false);

  const [pcFlags, setPcFlags] = useState<PyqContentFlag[]>([]);
  const [pcLoading, setPcLoading] = useState(false);
  const [pcRunning, setPcRunning] = useState(false);

  const [msSubs, setMsSubs] = useState<MainsSubmission[]>([]);
  const [msLoading, setMsLoading] = useState(false);
  const [bandStats, setBandStats] = useState<{ total_overrides: number; total_submissions: number; override_rate_pct: number | null } | null>(null);

  const [cronRows, setCronRows] = useState<CronHealthRow[]>([]);
  const [cronLoading, setCronLoading] = useState(false);

  const loadQualityFlags = useCallback(async () => {
    setQFlagsLoading(true);
    const { data, error } = await callFn('question-quality-audit', 'list_flags', { status: 'open' });
    if (!error && !data?.error) setQFlags(data.flags ?? []);
    setQFlagsLoading(false);
  }, []);

  const runQualityAudit = useCallback(async () => {
    setQFlagsRunning(true);
    await callFn('question-quality-audit', 'run_audit');
    await loadQualityFlags();
    setQFlagsRunning(false);
  }, [loadQualityFlags]);

  const resolveQualityFlag = useCallback(async (flag_id: string, status: 'actioned' | 'dismissed') => {
    await callFn('question-quality-audit', 'resolve_flag', { flag_id, status });
    setQFlags(prev => prev.filter(f => f.id !== flag_id));
  }, []);

  const approveCorrection = useCallback(async (flag_id: string, bank_id: string) => {
    await callFn('question-quality-audit', 'approve_correction', { bank_id });
    await callFn('question-quality-audit', 'resolve_flag', { flag_id, status: 'actioned' });
    setQFlags(prev => prev.filter(f => f.id !== flag_id));
  }, []);

  const rejectCorrection = useCallback(async (flag_id: string, bank_id: string) => {
    await callFn('question-quality-audit', 'reject_correction', { bank_id });
    await callFn('question-quality-audit', 'resolve_flag', { flag_id, status: 'dismissed' });
    setQFlags(prev => prev.filter(f => f.id !== flag_id));
  }, []);

  const loadAnomalies = useCallback(async () => {
    setAnomLoading(true);
    const { data, error } = await callFn('anomaly-detection', 'list_flags', { status: 'open' });
    if (!error && !data?.error) setAnomFlags(data.flags ?? []);
    setAnomLoading(false);
  }, []);

  const runAnomalyScan = useCallback(async () => {
    setAnomRunning(true);
    await callFn('anomaly-detection', 'run_scan');
    await loadAnomalies();
    setAnomRunning(false);
  }, [loadAnomalies]);

  const resolveAnomalyFlag = useCallback(async (flag_id: string, status: 'actioned' | 'dismissed') => {
    await callFn('anomaly-detection', 'resolve_flag', { flag_id, status });
    setAnomFlags(prev => prev.filter(f => f.id !== flag_id));
  }, []);

  const loadPyqFlags = useCallback(async () => {
    setPcLoading(true);
    const { data, error } = await callFn('pyq-content-audit', 'list_flagged');
    if (!error && !data?.error) setPcFlags(data.flags ?? []);
    setPcLoading(false);
  }, []);

  const runPyqAudit = useCallback(async () => {
    setPcRunning(true);
    await callFn('pyq-content-audit', 'run_audit');
    await loadPyqFlags();
    setPcRunning(false);
  }, [loadPyqFlags]);

  const approvePyqFlag = useCallback(async (id: string) => {
    await callFn('pyq-content-audit', 'approve', { id });
    setPcFlags(prev => prev.filter(f => f.id !== id));
  }, []);

  const rejectPyqFlag = useCallback(async (id: string) => {
    await callFn('pyq-content-audit', 'reject', { id });
    setPcFlags(prev => prev.filter(f => f.id !== id));
  }, []);

  const loadMainsSubs = useCallback(async () => {
    setMsLoading(true);
    const { data, error } = await callFn('mains-answer-evaluator', 'admin_list_recent');
    if (!error && !data?.error) setMsSubs(data.submissions ?? []);
    setMsLoading(false);
  }, []);

  const loadBandStats = useCallback(async () => {
    const { data } = await supabase.from('mains_band_stats').select('total_overrides, total_submissions, override_rate_pct');
    if (data && data.length > 0) {
      const totalOverrides = data.reduce((s, r) => s + (r.total_overrides ?? 0), 0);
      setBandStats({
        total_overrides: totalOverrides,
        total_submissions: data[0].total_submissions ?? 0,
        override_rate_pct: data[0].total_submissions ? Math.round((totalOverrides / data[0].total_submissions) * 1000) / 10 : null,
      });
    } else {
      setBandStats({ total_overrides: 0, total_submissions: 0, override_rate_pct: null });
    }
  }, []);

  const overrideBand = useCallback(async (submission_id: string, override_band: string) => {
    const { data, error } = await callFn('mains-answer-evaluator', 'override_band', { submission_id, override_band });
    if (error || data?.error) return;
    setMsSubs(prev => prev.map(s => s.id === submission_id
      ? { ...s, mains_band_overrides: [{ override_band, note: null, created_at: new Date().toISOString() }] }
      : s));
  }, []);

  const loadCronHealth = useCallback(async () => {
    setCronLoading(true);
    const { data } = await supabase.from('cron_health').select('*').order('jobname');
    setCronRows((data as CronHealthRow[] | null) ?? []);
    setCronLoading(false);
  }, []);

  const loadEvents = useCallback(async () => {
    const { data, error } = await callAdminConsole('list_live_events');
    if (error || data?.error) { setForbidden(true); return; }
    setEvents(data.events ?? []);
  }, []);

  const loadAudit = useCallback(async (offset: number) => {
    const { data, error } = await callAdminConsole('list_audit_log', {
      limit: AUDIT_PAGE_SIZE,
      offset,
      action_filter: auditActionFilter || undefined,
      source_filter: auditSourceFilter || undefined,
      search: auditSearch || undefined,
    });
    if (error || data?.error) { setForbidden(true); return; }
    setAudit(data.entries ?? []);
    setAuditTotal(data.total ?? 0);
    setAuditOffset(offset);
  }, [auditActionFilter, auditSourceFilter, auditSearch]);

  const loadAuditFilters = useCallback(async () => {
    const { data, error } = await callAdminConsole('list_audit_actions');
    if (error || data?.error) return;
    setAuditActions(data.actions ?? []);
    setAuditSources(data.sources ?? []);
  }, []);

  const loadAdmins = useCallback(async () => {
    const { data, error } = await callAdminConsole('list_admins');
    if (error || data?.error) { setForbidden(true); return; }
    setAdmins(data.admins ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadEvents(), loadAudit(0), loadAuditFilters(), loadAdmins()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-query audit log whenever a filter changes (debounced for the free-text search).
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => loadAudit(0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditActionFilter, auditSourceFilter, auditSearch]);

  // Lazy-load the two AI-review tabs only when first opened.
  useEffect(() => {
    if (tab === 'quality' && qFlags.length === 0 && !qFlagsLoading) loadQualityFlags();
    if (tab === 'anomalies' && anomFlags.length === 0 && !anomLoading) loadAnomalies();
    if (tab === 'pyqcontent' && pcFlags.length === 0 && !pcLoading) loadPyqFlags();
    if (tab === 'mainsqa' && msSubs.length === 0 && !msLoading) loadMainsSubs();
    if (tab === 'mainsqa' && bandStats === null) loadBandStats();
    if (tab === 'cronhealth' && cronRows.length === 0 && !cronLoading) loadCronHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Role granting/revoking is intentionally not exposed here — see admin-console
  // edge function comment. Elevating admin/moderator access goes through a
  // reviewed SQL migration, not a self-service button.

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <ShieldAlert className="w-10 h-10 text-red-400" />
        <p className="text-white font-semibold">Admin access required</p>
        <p className="text-white/50 text-sm">Your account doesn't have the admin role.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button aria-label="Go back" onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--ink-060)' }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-heading text-lg font-bold text-white flex-1">Admin Console</h1>
      </div>

      <div className="flex gap-2 px-4 mb-4 overflow-x-auto">
        {(['events', 'audit', 'admins', 'quality', 'anomalies', 'pyqcontent', 'mainsqa', 'cronhealth'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
            style={t === tab
              ? { background: 'var(--v2-primary-tint-2)', color: 'var(--v2-primary)', border: '1px solid var(--v2-primary)' }
              : { background: 'var(--v2-card)', color: 'var(--v2-text-4)', border: '1px solid var(--v2-border)' }}>
            {t === 'events' ? 'Live Events' : t === 'audit' ? 'Audit Log' : t === 'admins' ? 'Admins' : t === 'quality' ? 'Question QA' : t === 'anomalies' ? 'Anomalies' : t === 'pyqcontent' ? 'Content QA' : t === 'mainsqa' ? 'Mains QA' : 'Cron Health'}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 pb-nav overflow-y-auto">
        {tab === 'events' && (
          <>
            <button onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl mb-4 font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Plus size={16} /> Schedule Live Event
            </button>

            {events.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No live events yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {events.map(e => (
                  <div key={e.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'var(--ink-040)' }}>
                    <Trophy size={16} className="text-yellow-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{e.title}</p>
                      <p className="text-xs text-white/40">{e.subject} · {new Date(e.scheduled_at).toLocaleString()} · {e.participant_count} joined</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full"
                      style={{
                        background: e.status === 'live' ? 'rgba(16,185,129,0.15)' : e.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'var(--ink-060)',
                        color: e.status === 'live' ? '#34D399' : e.status === 'cancelled' ? '#F87171' : 'var(--ink-500)',
                      }}>
                      {e.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'audit' && (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                placeholder="Search action, source, target ID"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
            </div>
            <div className="flex gap-2">
              <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none">
                <option value="">All actions</option>
                {auditActions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={auditSourceFilter} onChange={e => setAuditSourceFilter(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none">
                <option value="">All sources</option>
                {auditSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {audit.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No admin actions match these filters.</p>
            ) : audit.map(a => (
              <div key={a.id} className="rounded-2xl p-3" style={{ background: 'var(--ink-040)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{a.action}</p>
                  <p className="text-xs text-white/40">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                <p className="text-xs text-white/40">{a.source}{a.target_id ? ` · target: ${a.target_id}` : ''}</p>
                {a.metadata && Object.keys(a.metadata).length > 0 && (
                  <p className="text-[11px] text-white/30 mt-1 truncate">{JSON.stringify(a.metadata)}</p>
                )}
              </div>
            ))}

            {auditTotal > AUDIT_PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2">
                <button disabled={auditOffset === 0}
                  onClick={() => loadAudit(Math.max(0, auditOffset - AUDIT_PAGE_SIZE))}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-30"
                  style={{ background: 'var(--ink-060)', color: 'var(--ink-950)' }}>
                  <ChevronLeft size={14} /> Prev
                </button>
                <p className="text-xs text-white/40">
                  {auditOffset + 1}–{Math.min(auditOffset + AUDIT_PAGE_SIZE, auditTotal)} of {auditTotal}
                </p>
                <button disabled={auditOffset + AUDIT_PAGE_SIZE >= auditTotal}
                  onClick={() => loadAudit(auditOffset + AUDIT_PAGE_SIZE)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-30"
                  style={{ background: 'var(--ink-060)', color: 'var(--ink-950)' }}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'admins' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/40 px-1">
              Read-only. Granting or revoking admin/moderator access requires a reviewed SQL migration — not exposed here to avoid a self-service privilege-escalation path.
            </p>
            {admins.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No staff roles granted yet.</p>
            ) : admins.map(a => (
              <div key={`${a.user_id}-${a.role}`} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'var(--ink-040)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{a.full_name ?? a.email ?? a.user_id}</p>
                  <p className="text-xs text-white/40">{a.email} · granted {new Date(a.granted_at).toLocaleDateString()}</p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{
                    background: a.role === 'admin' ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)',
                    color: a.role === 'admin' ? '#C4B5FD' : '#93C5FD',
                  }}>
                  {a.role}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'quality' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40">AI-flagged quiz questions — reported or statistically miscalibrated. Nemotron reasons over each; falls back to Gemini automatically.</p>
              <button onClick={runQualityAudit} disabled={qFlagsRunning}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--v2-primary-tint-2)', color: 'var(--v2-primary)', border: '1px solid var(--v2-primary)' }}>
                {qFlagsRunning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Run audit
              </button>
            </div>

            {qFlagsLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>
            ) : qFlags.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No open flags. Run an audit to check for new ones.</p>
            ) : qFlags.map(f => (
              <div key={f.id} className="rounded-2xl p-3" style={{ background: 'var(--ink-040)' }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <HelpCircle size={14} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: f.verdict === 'genuinely_hard' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: f.verdict === 'genuinely_hard' ? '#34D399' : '#F87171',
                      }}>{f.verdict}</span>
                  </div>
                  <span className="text-[11px] text-white/30">{f.model_used}</span>
                </div>
                <p className="text-sm text-white leading-snug mb-1">{f.question_text}</p>
                <p className="text-xs text-white/50 mb-2">{f.reasoning}</p>
                <p className="text-[11px] text-white/30 mb-2">
                  {f.subject ?? 'unknown subject'} · {f.topic ?? 'unknown topic'} ·
                  {f.correct_rate !== null ? ` ${f.correct_rate}% correct (n=${f.attempt_count})` : ' no stats'} ·
                  {f.report_count} report{f.report_count !== 1 ? 's' : ''}
                </p>

                {f.corrected_question && f.correction_bank_id && (
                  <div className="rounded-xl p-2.5 mb-2" style={{ background: 'var(--ink-060)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: '#8B5CF6' }}>
                      Self-healed correction (unapproved)
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="rounded-lg p-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#F87171' }}>Original (flagged)</p>
                        <p className="text-[11px] leading-snug mb-1 line-through" style={{ color: 'var(--ink-500)' }}>{f.question_text}</p>
                        <ul>
                          {originalOptionsList(f.sample_options).map((opt, i) => (
                            <li key={i} className="text-[10px] leading-snug" style={{ color: 'var(--ink-600)' }}>{opt}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#34D399' }}>Corrected</p>
                        <p className="text-[11px] leading-snug mb-1 text-white">{f.corrected_question.question_text}</p>
                        <ul>
                          {f.corrected_question.options.map((opt, i) => (
                            <li key={i} className="text-[10px] leading-snug"
                              style={{ color: i === f.corrected_question!.correct_index ? '#34D399' : 'var(--ink-500)' }}>
                              {i === f.corrected_question!.correct_index ? '✓ ' : '  '}{opt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/40 mb-2">{f.corrected_question.explanation}</p>
                    <div className="flex gap-2">
                      <button onClick={() => approveCorrection(f.id, f.correction_bank_id!)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold"
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>
                        <CheckIcon size={12} /> Approve into bank
                      </button>
                      <button onClick={() => rejectCorrection(f.id, f.correction_bank_id!)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold"
                        style={{ background: 'var(--ink-060)', color: 'var(--ink-500)' }}>
                        <X size={12} /> Reject
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => resolveQualityFlag(f.id, 'actioned')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399' }}>
                    <CheckIcon size={13} /> Actioned
                  </button>
                  <button onClick={() => resolveQualityFlag(f.id, 'dismissed')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--ink-060)', color: 'var(--ink-500)' }}>
                    <X size={13} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'anomalies' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40">Flagged battle-timing patterns. Reasoning-based, flags only — no auto-punishment. Human review required.</p>
              <button onClick={runAnomalyScan} disabled={anomRunning}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--v2-primary-tint-2)', color: 'var(--v2-primary)', border: '1px solid var(--v2-primary)' }}>
                {anomRunning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Run scan
              </button>
            </div>

            {anomLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>
            ) : anomFlags.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No open flags. Run a scan to check for new ones.</p>
            ) : anomFlags.map(f => (
              <div key={f.id} className="rounded-2xl p-3" style={{ background: 'var(--ink-040)' }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Siren size={14} className="text-red-400 shrink-0" />
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: f.severity === 'high' ? 'rgba(239,68,68,0.15)' : f.severity === 'medium' ? 'rgba(245,158,11,0.15)' : 'var(--ink-060)',
                        color: f.severity === 'high' ? '#F87171' : f.severity === 'medium' ? '#FBBF24' : 'var(--ink-500)',
                      }}>{f.severity} severity</span>
                  </div>
                  <span className="text-[11px] text-white/30">{f.model_used}</span>
                </div>
                <p className="text-sm text-white mb-1">{f.profiles?.full_name ?? f.user_id}</p>
                <p className="text-xs text-white/50 mb-2">{f.reasoning}</p>
                <div className="flex gap-2">
                  <button onClick={() => resolveAnomalyFlag(f.id, 'actioned')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
                    <CheckIcon size={13} /> Actioned
                  </button>
                  <button onClick={() => resolveAnomalyFlag(f.id, 'dismissed')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--ink-060)', color: 'var(--ink-500)' }}>
                    <X size={13} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'pyqcontent' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40">AI second-reviewer over unreviewed PYQ content (CAT/UPSC/CBSE/JEE/NEET). Flags factual/formatting issues before content is trusted.</p>
              <button onClick={runPyqAudit} disabled={pcRunning}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--v2-primary-tint-2)', color: 'var(--v2-primary)', border: '1px solid var(--v2-primary)' }}>
                {pcRunning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Run audit
              </button>
            </div>

            {pcLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>
            ) : pcFlags.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No flagged content. Run an audit to check for new issues.</p>
            ) : pcFlags.map(f => (
              <div key={f.id} className="rounded-2xl p-3" style={{ background: 'var(--ink-040)' }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>
                    {f.exam} · {f.subject}
                  </span>
                  <span className="text-[11px] text-white/30">{f.reviewed_by}</span>
                </div>
                <p className="text-sm font-bold text-white leading-snug mb-1">{f.question_text}</p>
                <p className="text-xs text-white/50 mb-2">{f.review_notes}</p>
                <p className="text-[11px] text-white/30 mb-2">{f.chapter} · marked correct: {f.correct_option ?? '—'}</p>
                <div className="flex gap-2">
                  <button onClick={() => approvePyqFlag(f.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399' }}>
                    <CheckIcon size={13} /> Approve (keep live)
                  </button>
                  <button onClick={() => rejectPyqFlag(f.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
                    <X size={13} /> Retire question
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'mainsqa' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/40">Recent UPSC/CBSE Mains submissions — spot-check AI evaluation quality. Flagged rows matched the model answer's wording closely (likely copy-paste).</p>

            {bandStats && (
              <div className="rounded-2xl p-3 text-xs" style={{ background: 'var(--ink-040)', color: bandStats.total_overrides >= 30 ? '#FBBF24' : 'var(--ink-500)' }}>
                {bandStats.total_overrides} band overrides logged out of {bandStats.total_submissions} submissions
                {bandStats.override_rate_pct !== null ? ` (${bandStats.override_rate_pct}%)` : ''}.{' '}
                {bandStats.total_overrides >= 30
                  ? 'Enough signal to bring to a real UPSC/CBSE mentor for a calibration review.'
                  : 'Needs 30+ overrides before recalibrating band thresholds off this data.'}
              </div>
            )}

            {msLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>
            ) : msSubs.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No submissions yet.</p>
            ) : msSubs.map(s => (
              <div key={s.id} className="rounded-2xl p-3" style={{ background: 'var(--ink-040)' }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(91,106,245,0.15)', color: '#818CF8' }}>
                    {s.mains_questions?.exam === 'CBSE' ? `CBSE ${s.mains_questions.class_level ?? ''} · ` : ''}{s.mains_questions?.paper ?? '—'}
                  </span>
                  <span className="text-[11px] text-white/30">{s.model_used}</span>
                </div>
                <p className="text-sm text-white leading-snug mb-1">{s.mains_questions?.question_text ?? s.question_id}</p>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--ink-060)', color: 'var(--ink-500)' }}>
                    {s.score_band}
                  </span>
                  <span className="text-[11px] text-white/30">{s.word_count} words</span>
                  {s.suspected_copy && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
                      Suspected copy ({Math.round((s.copy_overlap_ratio ?? 0) * 100)}% overlap)
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 mb-2">{s.structure_feedback}</p>

                {s.mains_band_overrides?.[0] ? (
                  <p className="text-[11px]" style={{ color: '#FBBF24' }}>
                    Admin override: {s.mains_band_overrides[0].override_band} (was {s.score_band})
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-white/30 mr-1">Disagree? Log correction:</span>
                    {['needs_work', 'developing', 'good', 'excellent'].map(b => (
                      <button key={b} onClick={() => overrideBand(s.id, b)} disabled={b === s.score_band}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full disabled:opacity-30"
                        style={{ background: 'var(--ink-060)', color: 'var(--ink-500)' }}>
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'cronhealth' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40">Last reported run for every nightly/weekly AI job. Nothing here means it has never reported — check it's actually scheduled.</p>
              <button onClick={loadCronHealth} disabled={cronLoading}
                className="shrink-0 ml-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--ink-060)' }}>
                <RefreshCw size={14} className={`text-white/60 ${cronLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {cronLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-white/40 animate-spin" /></div>
            ) : cronRows.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No cron jobs have reported yet.</p>
            ) : cronRows.map(r => {
              const hoursSince = r.last_run_at ? (Date.now() - new Date(r.last_run_at).getTime()) / 3_600_000 : null;
              const stale = hoursSince === null || hoursSince > 36;
              const statusColor = r.last_status === 'success' ? '#4ADE80' : r.last_status === 'error' ? '#F87171' : '#FBBF24';
              return (
                <div key={r.jobname} className="rounded-2xl p-3" style={{ background: 'var(--ink-040)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">{r.jobname}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${statusColor}22`, color: statusColor }}>
                      {r.last_status ?? 'never run'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/40">
                    {r.last_run_at ? new Date(r.last_run_at).toLocaleString() : 'no run recorded'}
                    {stale && r.last_run_at && <span className="text-yellow-400 font-semibold"> · stale (&gt;36h)</span>}
                  </p>
                  {r.last_summary && (
                    <p className="text-[11px] text-white/30 mt-1 truncate">{JSON.stringify(r.last_summary)}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateLiveEventModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadEvents(); }}
        />
      )}
    </div>
  );
}

function CreateLiveEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle]     = useState('');
  const [subject, setSubject] = useState('Physics');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMins, setDurationMins] = useState(15);
  const [questionIdsRaw, setQuestionIdsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    const question_ids = questionIdsRaw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (!title || !subject || !scheduledAt || question_ids.length === 0) {
      setError('All fields required, including at least one question ID (from pyq_content).');
      return;
    }
    setSubmitting(true);
    setError('');
    const { data, error: err } = await callAdminConsole('create_live_event', {
      title, subject, scheduled_at: new Date(scheduledAt).toISOString(),
      duration_mins: durationMins, question_ids,
    });
    setSubmitting(false);
    if (err || data?.error) {
      setError(data?.error ? JSON.stringify(data.error) : (err?.message ?? 'Failed to create event'));
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full rounded-t-3xl p-5" style={{ background: 'var(--surface-sheet)', border: '1px solid var(--ink-080)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-heading font-bold text-white text-lg">Schedule Live Event</p>
          <button onClick={onClose}><X size={18} className="text-white/50" /></button>
        </div>

        <div className="flex flex-col gap-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject (e.g. Physics)"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
          <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
          <input type="number" min={5} max={60} value={durationMins} onChange={e => setDurationMins(Number(e.target.value))}
            placeholder="Duration (mins)"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
          <textarea value={questionIdsRaw} onChange={e => setQuestionIdsRaw(e.target.value)}
            placeholder="pyq_content question IDs — one per line or comma-separated"
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none resize-none" />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button onClick={handleSubmit} disabled={submitting}
            className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            {submitting ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
