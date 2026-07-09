import { useState, useEffect, useCallback } from 'react';
import {ChevronLeft, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Percent} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────
interface RunSummary {
  run_id: string;
  created_at: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_score: number;
  avg_latency_ms: number;
}

interface EvalRun {
  id: string;
  run_id: string;
  pass: boolean;
  score: number;
  latency_ms: number;
  judge_reasoning: string;
  tools_called: string[];
  error: string | null;
  eval_case: {
    name: string;
    category: string;
    difficulty: number;
    query: string;
  } | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  tool_use:  'bg-blue-500/20 text-blue-300',
  prereq:    'bg-purple-500/20 text-purple-300',
  rag:       'bg-amber-500/20 text-amber-300',
  topic:     'bg-emerald-500/20 text-emerald-300',
  safety:    'bg-red-500/20 text-red-300',
  language:  'bg-pink-500/20 text-pink-300',
  memory:    'bg-cyan-500/20 text-cyan-300' };

function Badge({ label, cat }: { label: string; cat: string }) {
  const cls = CATEGORY_COLORS[cat] ?? 'bg-zinc-500/20 text-zinc-300';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EvalDashboardPage() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [runSummaries, setRunSummaries] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pass' | 'fail'>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  // Load latest run summaries
  const loadSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Get last 10 run IDs with stats
      const { data, error: err } = await supabase
        .from('novo_eval_runs')
        .select('run_id, pass, score, latency_ms, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (err) throw err;

      // Group by run_id
      const grouped: Record<string, typeof data> = {};
      for (const r of data ?? []) {
        if (!grouped[r.run_id]) grouped[r.run_id] = [];
        grouped[r.run_id]!.push(r);
      }
      const summaries: RunSummary[] = Object.entries(grouped)
        .slice(0, 10)
        .map(([run_id, rows]) => {
          const passed = rows!.filter(r => r.pass).length;
          const total  = rows!.length;
          return {
            run_id,
            created_at: rows![0].created_at,
            total, passed, failed: total - passed,
            pass_rate:  Math.round((passed / total) * 100),
            avg_score:  rows!.reduce((a, r) => a + r.score, 0) / total,
            avg_latency_ms: Math.round(rows!.reduce((a, r) => a + r.latency_ms, 0) / total) };
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRunSummaries(summaries);
      if (summaries.length > 0 && !selectedRunId) {
        setSelectedRunId(summaries[0].run_id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedRunId]);

  // Load individual run detail
  const loadRunDetail = useCallback(async (runId: string) => {
    const { data, error: err } = await supabase
      .from('novo_eval_runs')
      .select(`
        id, run_id, pass, score, latency_ms, judge_reasoning, tools_called, error,
        eval_case:eval_case_id (name, category, difficulty, query)
      `)
      .eq('run_id', runId)
      .order('pass', { ascending: true })
      .order('score', { ascending: true });
    if (!err) setRuns((data ?? []) as unknown as EvalRun[]);
  }, []);

  useEffect(() => { loadSummaries(); }, [loadSummaries]);
  useEffect(() => { if (selectedRunId) loadRunDetail(selectedRunId); }, [selectedRunId, loadRunDetail]);

  // Trigger a new eval run
  const triggerRun = async (category?: string) => {
    setRunning(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('novo-eval-run', {
        body:    category ? { category } : {},
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          'x-eval-secret': 'novo-eval-secret-2026' } });
      if (res.error) throw new Error(res.error.message);
      await loadSummaries();
      if (res.data?.run_id) setSelectedRunId(res.data.run_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const currentSummary  = runSummaries.find(r => r.run_id === selectedRunId);
  const previousSummary = runSummaries[runSummaries.indexOf(currentSummary!) + 1];
  const passRateDelta   = currentSummary && previousSummary
    ? currentSummary.pass_rate - previousSummary.pass_rate : null;

  const categories = ['all', ...Array.from(new Set(runs.map(r => r.eval_case?.category ?? 'unknown')))];
  const filteredRuns = runs.filter(r => {
    if (filter === 'pass' && !r.pass) return false;
    if (filter === 'fail' && r.pass)  return false;
    if (catFilter !== 'all' && r.eval_case?.category !== catFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <Link to="/settings" className="text-zinc-400 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">Novo Eval Dashboard</h1>
          <p className="text-xs text-zinc-500">QA / Regression Harness</p>
        </div>
        <Button
          size="sm" disabled={running}
          onClick={() => triggerRun()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
        >
          {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {running ? 'Running…' : 'Run All'}
        </Button>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-20 pt-4 space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Stats row */}
        {currentSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Pass Rate"
              value={`${currentSummary.pass_rate}%`}
              delta={passRateDelta !== null ? `${passRateDelta > 0 ? '+' : ''}${passRateDelta}% vs prev` : undefined}
              deltaPositive={passRateDelta !== null ? passRateDelta >= 0 : undefined}
              icon={<Percent className="w-4 h-4" />}
              color={currentSummary.pass_rate >= 80 ? 'text-emerald-400' : currentSummary.pass_rate >= 60 ? 'text-amber-400' : 'text-red-400'}
            />
            <StatCard label="Passed" value={String(currentSummary.passed)} icon={<CheckCircle2 className="w-4 h-4" />} color="text-emerald-400" />
            <StatCard label="Failed" value={String(currentSummary.failed)} icon={<XCircle className="w-4 h-4" />} color="text-red-400" />
            <StatCard label="Avg Latency" value={`${currentSummary.avg_latency_ms}ms`} icon={<Clock className="w-4 h-4" />} color="text-blue-400" />
          </div>
        )}

        {/* Run history */}
        {runSummaries.length > 1 && (
          <div>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Run History</h2>
            <div className="flex gap-2 flex-wrap">
              {runSummaries.map(s => (
                <button
                  key={s.run_id}
                  onClick={() => setSelectedRunId(s.run_id)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    selectedRunId === s.run_id
                      ? 'bg-zinc-700 border-zinc-500 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {new Date(s.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  <span className={`ml-1.5 font-semibold ${s.pass_rate >= 80 ? 'text-emerald-400' : s.pass_rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                    {s.pass_rate}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick run by category */}
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Quick Run by Category</h2>
          <div className="flex gap-2 flex-wrap">
            {['tool_use','prereq','rag','topic','safety','language'].map(cat => (
              <button
                key={cat}
                disabled={running}
                onClick={() => triggerRun(cat)}
                className="px-3 py-1.5 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors disabled:opacity-40"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        {runs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-zinc-800">
              {(['all','pass','fail'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    filter === f ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {f === 'all' ? `All (${runs.length})` : f === 'pass' ? `✓ Passed (${runs.filter(r => r.pass).length})` : `✗ Failed (${runs.filter(r => !r.pass).length})`}
                </button>
              ))}
            </div>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 focus:outline-none"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {/* Results list */}
        {loading ? (
          <div className="text-center text-zinc-500 text-sm py-12">Loading…</div>
        ) : filteredRuns.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-12">
            {runs.length === 0 ? 'No eval runs yet. Click "Run All" to start.' : 'No results match filters.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRuns.map(r => (
              <EvalCard key={r.id} run={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, delta, deltaPositive, icon, color }: {
  label: string; value: string; delta?: string; deltaPositive?: boolean;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>{icon}<span className="text-xs">{label}</span></div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {delta && (
        <div className={`text-xs mt-0.5 ${deltaPositive ? 'text-emerald-400' : 'text-red-400'}`}>{delta}</div>
      )}
    </div>
  );
}

function EvalCard({ run }: { run: EvalRun }) {
  const [expanded, setExpanded] = useState(false);
  const c = run.eval_case;
  return (
    <div
      className={`bg-zinc-900 border rounded-xl overflow-hidden transition-colors cursor-pointer ${
        run.pass ? 'border-zinc-800 hover:border-zinc-700' : 'border-red-900/50 hover:border-red-800/60'
      }`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {run.pass
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          : run.error ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{c?.name ?? 'Unknown'}</span>
            {c?.category && <Badge label={c.category} cat={c.category} />}
            {c?.difficulty === 3 && <span className="text-xs text-amber-400">Hard</span>}
          </div>
          <ScoreBar score={run.score} />
        </div>
        <div className="text-xs text-zinc-500 shrink-0">{run.latency_ms}ms</div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
          {c?.query && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Query</p>
              <p className="text-xs text-zinc-300 italic">"{c.query}"</p>
            </div>
          )}
          {run.tools_called?.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Tools called</p>
              <div className="flex gap-1.5 flex-wrap">
                {run.tools_called.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs">{t}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Judge reasoning</p>
            <p className={`text-xs ${run.pass ? 'text-zinc-300' : 'text-red-300'}`}>{run.judge_reasoning}</p>
          </div>
          {run.error && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Error</p>
              <p className="text-xs text-red-400 font-mono">{run.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
