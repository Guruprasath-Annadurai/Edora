// ═══════════════════════════════════════════════════════════════
// Edora — SubjectDependencyPage
// SVG-based directed graph of subject dependencies + unlock path list.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, XCircle, Zap, BookOpen, Map as MapIcon, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { loadSubjectMastery } from '@/lib/adaptiveDifficulty';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dep {
  id:          string;
  subject:     string;
  requires:    string;
  strength:    'required' | 'recommended' | 'helpful';
  description: string | null;
}

type StrengthFilter = 'all' | 'required' | 'recommended' | 'helpful';

// Graph layout types
interface GraphNode {
  subject: string;
  col:     number;
  row:     number;
  x:       number;
  y:       number;
  mastery: number; // 0-1, -1 = unknown
}

interface GraphEdge {
  from:     string;
  to:       string;
  strength: Dep['strength'];
}

// Selected node info sheet
interface NodeInfo {
  subject:     string;
  mastery:     number;
  deps:        Dep[];  // deps where this subject is the `subject`
  strength:    Dep['strength'] | null;
  description: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_W  = 120;
const NODE_H  = 40;
const COL_GAP = 180;
const ROW_GAP = 72;
const PAD_X   = 40;
const PAD_Y   = 40;

const STRENGTH_COLORS: Record<Dep['strength'], string> = {
  required:    '#EF4444',
  recommended: '#F59E0B',
  helpful:     '#6B7280',
};

const MASTERY_FILL: (m: number) => string = (m) => {
  if (m < 0) return '#6B7280';   // unknown
  if (m >= 0.7) return '#10B981';
  if (m >= 0.4) return '#F59E0B';
  return '#6B7280';
};

// ── Layout builder ────────────────────────────────────────────────────────────

function buildLayout(deps: Dep[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Collect all unique subjects
  const allSubjects = Array.from(
    new Set([...deps.map(d => d.subject), ...deps.map(d => d.requires)])
  );

  // Build adjacency: which subjects depend on which (requires → dependants)
  const dependants = new Map<string, Set<string>>();
  const requires   = new Map<string, Set<string>>();
  for (const s of allSubjects) {
    dependants.set(s, new Set());
    requires.set(s, new Set());
  }
  for (const d of deps) {
    dependants.get(d.requires)!.add(d.subject);
    requires.get(d.subject)!.add(d.requires);
  }

  // BFS topological column assignment
  const colMap = new Map<string, number>();
  // Roots = subjects with no requirements (nothing they "require")
  const roots = allSubjects.filter(s => requires.get(s)!.size === 0);
  const queue: string[] = [...roots];
  for (const r of roots) colMap.set(r, 0);

  while (queue.length > 0) {
    const s = queue.shift()!;
    const myCol = colMap.get(s) ?? 0;
    for (const dep of dependants.get(s) ?? []) {
      const current = colMap.get(dep) ?? -1;
      if (current <= myCol) {
        colMap.set(dep, myCol + 1);
        queue.push(dep);
      }
    }
  }

  // Assign rows within each column
  const colRows = new Map<number, string[]>();
  for (const s of allSubjects) {
    const col = colMap.get(s) ?? 0;
    if (!colRows.has(col)) colRows.set(col, []);
    colRows.get(col)!.push(s);
  }

  const nodes: GraphNode[] = [];
  for (const [col, subjects] of colRows.entries()) {
    subjects.forEach((subject, rowIndex) => {
      nodes.push({
        subject,
        col,
        row:    rowIndex,
        x:      PAD_X + col * COL_GAP,
        y:      PAD_Y + rowIndex * ROW_GAP,
        mastery: -1,
      });
    });
  }

  const edges: GraphEdge[] = deps.map(d => ({
    from:     d.requires,
    to:       d.subject,
    strength: d.strength,
  }));

  return { nodes, edges };
}

// ── SVG edge path ─────────────────────────────────────────────────────────────

function edgePath(from: GraphNode, to: GraphNode): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

// ── Bottom Sheet ──────────────────────────────────────────────────────────────

interface BottomSheetProps {
  info:     NodeInfo | null;
  mastery:  number;
  onClose:  () => void;
  onStudy:  (subject: string) => void;
}

function BottomSheet({ info, onClose, onStudy }: BottomSheetProps) {
  if (!info) return null;
  const fillColor = MASTERY_FILL(info.mastery);
  const masteryPct = info.mastery < 0 ? null : Math.round(info.mastery * 100);

  return (
    <AnimatePresence>
      <motion.div
        key="sheet-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-5 pt-4 pb-8 max-w-lg mx-auto"
        style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--ink-150)' }} />

        {/* Subject name */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: fillColor + '22', border: `2px solid ${fillColor}` }}
          >
            <BookOpen size={16} style={{ color: fillColor }} />
          </div>
          <div>
            <h3 className="font-heading text-base font-bold text-white">
              {info.subject}
            </h3>
            {masteryPct !== null && (
              <p className="text-xs" style={{ color: 'var(--ink-500)' }}>
                Mastery: <span className="font-bold" style={{ color: fillColor }}>{masteryPct}%</span>
              </p>
            )}
            {masteryPct === null && (
              <p className="text-xs" style={{ color: 'var(--ink-500)' }}>Not yet started</p>
            )}
          </div>
        </div>

        {/* Description */}
        {info.description && (
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink-600)' }}>
            {info.description}
          </p>
        )}

        {/* Dependency strength */}
        {info.strength && (
          <div className="flex items-center gap-2 mb-4">
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-bold capitalize"
              style={{
                background: STRENGTH_COLORS[info.strength] + '22',
                color:      STRENGTH_COLORS[info.strength],
              }}
            >
              {info.strength} dependency
            </span>
          </div>
        )}

        {/* Study button */}
        <button
          onClick={() => onStudy(info.subject)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          <Zap size={15} />
          Study {info.subject}
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Graph SVG ─────────────────────────────────────────────────────────────────

interface GraphProps {
  nodes:          GraphNode[];
  edges:          GraphEdge[];
  filter:         StrengthFilter;
  onNodeTap:      (node: GraphNode, relatedDeps: Dep[]) => void;
  allDeps:        Dep[];
}

function GraphSVG({ nodes, edges, filter, onNodeTap, allDeps }: GraphProps) {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.subject, n);

  const filteredEdges = edges.filter(e =>
    filter === 'all' ? true : e.strength === filter
  );

  const maxX = Math.max(...nodes.map(n => n.x), 0) + NODE_W + PAD_X;
  const maxY = Math.max(...nodes.map(n => n.y), 0) + NODE_H + PAD_Y;

  return (
    <div className="overflow-x-auto native-scroll-x pb-2">
      <svg
        width={maxX}
        height={maxY}
        style={{ minWidth: maxX, display: 'block' }}
      >
        <defs>
          {/* Arrow markers for each strength */}
          {(['required', 'recommended', 'helpful'] as Dep['strength'][]).map(s => (
            <marker
              key={s}
              id={`arrow-${s}`}
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon
                points="0 0, 8 3, 0 6"
                fill={STRENGTH_COLORS[s]}
              />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        {filteredEdges.map((edge, i) => {
          const fromNode = nodeMap.get(edge.from);
          const toNode   = nodeMap.get(edge.to);
          if (!fromNode || !toNode) return null;

          const color    = STRENGTH_COLORS[edge.strength];
          const isDashed = edge.strength === 'recommended';
          const isDotted = edge.strength === 'helpful';

          return (
            <path
              key={i}
              d={edgePath(fromNode, toNode)}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeDasharray={isDotted ? '2 4' : isDashed ? '6 3' : undefined}
              markerEnd={`url(#arrow-${edge.strength})`}
              opacity={0.75}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const fill   = MASTERY_FILL(node.mastery);
          const relDeps = allDeps.filter(d => d.subject === node.subject);
          return (
            <g
              key={node.subject}
              onClick={() => onNodeTap(node, relDeps)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                ry={10}
                fill={fill + '33'}
                stroke={fill}
                strokeWidth={2}
              />
              <text
                x={node.x + NODE_W / 2}
                y={node.y + NODE_H / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={600}
                fill={fill === '#6B7280' ? 'var(--ink-600)' : fill === '#10B981' ? '#34D399' : '#FBBF24'}
                style={{ fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}
              >
                {node.subject.length > 14 ? node.subject.slice(0, 13) + '…' : node.subject}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="rounded-2xl p-3 flex flex-wrap gap-x-4 gap-y-2"
      style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
      {/* Edge types */}
      <div className="flex items-center gap-1.5">
        <svg width="22" height="8">
          <line x1="0" y1="4" x2="22" y2="4" stroke="#EF4444" strokeWidth="2" />
        </svg>
        <span className="text-xs" style={{ color: 'var(--ink-500)' }}>Required</span>
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="22" height="8">
          <line x1="0" y1="4" x2="22" y2="4" stroke="#F59E0B" strokeWidth="2" strokeDasharray="5 2" />
        </svg>
        <span className="text-xs" style={{ color: 'var(--ink-500)' }}>Recommended</span>
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="22" height="8">
          <line x1="0" y1="4" x2="22" y2="4" stroke="#6B7280" strokeWidth="2" strokeDasharray="2 3" />
        </svg>
        <span className="text-xs" style={{ color: 'var(--ink-500)' }}>Helpful</span>
      </div>

      {/* Mastery levels */}
      <div className="flex items-center gap-1.5">
        <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#10B981' }} />
        <span className="text-xs" style={{ color: 'var(--ink-500)' }}>Mastered (70%+)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#F59E0B' }} />
        <span className="text-xs" style={{ color: 'var(--ink-500)' }}>Developing (40–70%)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#6B7280' }} />
        <span className="text-xs" style={{ color: 'var(--ink-500)' }}>Not started / below 40%</span>
      </div>
    </div>
  );
}

// ── Unlock Path (list view) ───────────────────────────────────────────────────

interface UnlockPathProps {
  nodes:       GraphNode[];
  masteryMap:  Record<string, number>;
  allDeps:     Dep[];
  onStudy:     (subject: string) => void;
}

function UnlockPath({ nodes, masteryMap, allDeps, onStudy }: UnlockPathProps) {
  // Sort nodes by column (topological order), then row
  const sorted = [...nodes].sort((a, b) => a.col - b.col || a.row - b.row);

  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map((node, i) => {
        const mastery    = masteryMap[node.subject] ?? -1;
        const masteryPct = mastery < 0 ? null : Math.round(mastery * 100);
        const fill       = MASTERY_FILL(mastery);
        const isMastered = mastery >= 0.7;

        // Prerequisites: find subjects that this node requires
        const prereqs = allDeps
          .filter(d => d.subject === node.subject)
          .map(d => d.requires);

        // All prerequisites met = all required deps are mastered
        const requiredPrereqs = allDeps
          .filter(d => d.subject === node.subject && d.strength === 'required')
          .map(d => d.requires);

        const prereqsMet = requiredPrereqs.every(
          r => (masteryMap[r] ?? -1) >= 0.7
        );

        const readyToLearn = prereqsMet && !isMastered;

        return (
          <motion.div
            key={node.subject}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="rounded-2xl p-3.5 flex items-center gap-3"
            style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
          >
            {/* Step number */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: fill + '22', color: fill }}
            >
              {i + 1}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white">{node.subject}</p>
                {readyToLearn && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }}
                  >
                    Ready to learn
                  </span>
                )}
                {isMastered && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }}
                  >
                    Mastered
                  </span>
                )}
              </div>

              {prereqs.length > 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  {prereqsMet
                    ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                    : <XCircle     size={11} className="text-red-400 shrink-0" />
                  }
                  <p className="text-xs truncate" style={{ color: 'var(--ink-500)' }}>
                    Needs: {prereqs.join(', ')}
                  </p>
                </div>
              )}
            </div>

            {/* Mastery pct */}
            {masteryPct !== null && (
              <span className="text-xs font-bold shrink-0" style={{ color: fill }}>
                {masteryPct}%
              </span>
            )}

            {/* Study button */}
            <button
              onClick={() => onStudy(node.subject)}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition-all"
              style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)' }}
            >
              <Zap size={14} style={{ color: '#8B9BFA' }} />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const FILTERS: { label: string; value: StrengthFilter }[] = [
  { label: 'All',         value: 'all'         },
  { label: 'Required',    value: 'required'    },
  { label: 'Recommended', value: 'recommended' },
  { label: 'Helpful',     value: 'helpful'     },
];

export default function SubjectDependencyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  const [deps,        setDeps]        = useState<Dep[]>([]);
  const [nodes,       setNodes]       = useState<GraphNode[]>([]);
  const [edges,       setEdges]       = useState<GraphEdge[]>([]);
  const [masteryMap,  setMasteryMap]  = useState<Record<string, number>>({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [filter,      setFilter]      = useState<StrengthFilter>('all');
  const [view,        setView]        = useState<'graph' | 'list'>('graph');
  const [selectedInfo, setSelectedInfo] = useState<NodeInfo | null>(null);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch deps
      const { data, error: dbErr } = await supabase
        .from('subject_dependencies')
        .select('*')
        .order('subject');

      if (dbErr) throw dbErr;
      const depRows = (data ?? []) as Dep[];
      if (!mountedRef.current) return;
      setDeps(depRows);

      // Build graph layout
      const { nodes: layoutNodes, edges: layoutEdges } = buildLayout(depRows);

      // Fetch mastery for all unique subjects
      const allSubjects = Array.from(
        new Set([...depRows.map(d => d.subject), ...depRows.map(d => d.requires)])
      );

      const masteryResults = await Promise.allSettled(
        allSubjects.map(subject => loadSubjectMastery(user.id, subject))
      );

      if (!mountedRef.current) return;

      const newMasteryMap: Record<string, number> = {};
      for (let i = 0; i < allSubjects.length; i++) {
        const subject = allSubjects[i];
        const result  = masteryResults[i];
        if (result.status === 'fulfilled' && result.value.length > 0) {
          const avg = result.value.reduce((s, m) => s + m.mastery_score, 0) / result.value.length;
          newMasteryMap[subject] = avg;
        }
      }
      setMasteryMap(newMasteryMap);

      // Hydrate mastery into nodes
      const hydratedNodes = layoutNodes.map(n => ({
        ...n,
        mastery: newMasteryMap[n.subject] ?? -1,
      }));
      setNodes(hydratedNodes);
      setEdges(layoutEdges);

    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[SubjectDependency] load:', err);
      setError('Failed to load subject map. Check your connection.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleNodeTap = useCallback((node: GraphNode, relatedDeps: Dep[]) => {
    const firstDep = relatedDeps[0] ?? null;
    setSelectedInfo({
      subject:     node.subject,
      mastery:     node.mastery,
      deps:        relatedDeps,
      strength:    firstDep?.strength ?? null,
      description: firstDep?.description ?? null,
    });
  }, []);

  const handleStudy = useCallback((subject: string) => {
    setSelectedInfo(null);
    navigate(`/tutoring?subject=${encodeURIComponent(subject)}`);
  }, [navigate]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Header ── */}
      <div className="px-4 py-3 shrink-0 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-all text-white"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)', WebkitTapHighlightColor: 'transparent' }}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1">
          <h1 className="font-heading text-lg font-bold text-white leading-tight">
            Subject Map
          </h1>
          <p className="text-xs" style={{ color: 'var(--ink-500)' }}>Knowledge unlock graph</p>
        </div>

        {/* Graph / List toggle */}
        <div
          className="flex items-center gap-0.5 rounded-xl p-0.5"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-080)' }}
        >
          <button
            onClick={() => setView('graph')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
            style={view === 'graph'
              ? { background: 'rgba(91,106,245,0.2)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
              : {}
            }
          >
            <MapIcon size={15} style={{ color: view === 'graph' ? '#8B9BFA' : 'var(--ink-400)' }} />
          </button>
          <button
            onClick={() => setView('list')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
            style={view === 'list'
              ? { background: 'rgba(91,106,245,0.2)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
              : {}
            }
          >
            <List size={15} style={{ color: view === 'list' ? '#8B9BFA' : 'var(--ink-400)' }} />
          </button>
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div className="shrink-0 px-4 py-2.5 overflow-x-auto native-scroll-x"
        style={{ borderBottom: '1px solid var(--ink-060)' }}>
        <div className="flex gap-2 w-max">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all active:scale-95"
              style={
                filter === f.value
                  ? { background: 'rgba(91,106,245,0.15)', borderColor: '#5B6AF5', color: '#8B9BFA' }
                  : { background: 'var(--ink-045)', borderColor: 'var(--ink-100)', color: 'var(--ink-450)' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav">

        {/* Loading spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div
              className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: '#E5E7EB', borderTopColor: '#5B6AF5' }}
            />
            <p className="text-sm" style={{ color: 'var(--ink-500)' }}>Building subject map…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="mx-4 mt-4 px-4 py-3 rounded-2xl flex items-start gap-2.5"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <XCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs font-medium text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && deps.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center px-6 pt-16"
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)' }}
            >
              <MapIcon size={36} style={{ color: '#8B9BFA' }} />
            </div>
            <h2 className="font-heading text-xl font-bold text-white mb-2">
              No dependencies yet
            </h2>
            <p className="text-sm max-w-xs" style={{ color: 'var(--ink-500)' }}>
              Subject dependency data hasn't been set up for your curriculum yet.
            </p>
          </motion.div>
        )}

        {/* Graph or List */}
        {!loading && !error && deps.length > 0 && (
          <div className="px-4 py-4 flex flex-col gap-4 pb-10">

            {view === 'graph' && (
              <motion.div
                key="graph"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-4"
              >
                <div
                  className="rounded-2xl p-3 overflow-hidden"
                  style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
                >
                  <GraphSVG
                    nodes={nodes}
                    edges={edges}
                    filter={filter}
                    onNodeTap={handleNodeTap}
                    allDeps={deps}
                  />
                </div>

                <Legend />
              </motion.div>
            )}

            {view === 'list' && (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <h3 className="text-sm font-bold text-white mb-3 px-1">
                  Your Unlock Path
                </h3>
                <UnlockPath
                  nodes={nodes}
                  masteryMap={masteryMap}
                  allDeps={deps}
                  onStudy={handleStudy}
                />
              </motion.div>
            )}

          </div>
        )}
      </div>

      {/* ── Bottom Sheet ── */}
      {selectedInfo && (
        <BottomSheet
          info={selectedInfo}
          mastery={selectedInfo.mastery}
          onClose={() => setSelectedInfo(null)}
          onStudy={handleStudy}
        />
      )}
    </div>
  );
}
