// ═══════════════════════════════════════════════════════════════
// Edora — ConceptMapPage
// Personal knowledge graph: every concept the student has studied,
// coloured by mastery, with directed edges showing learning order.
// Pure SVG + math — no D3, no React Flow.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, BookOpen, Zap, CheckCircle2, Clock, GitBranch } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConceptNode {
  id: string;
  user_id: string;
  subject: string;
  title: string;
  description: string;
  mastery_pct: number;
  times_studied: number;
  times_tested: number;
  times_correct: number;
  last_studied_at: string | null;
  created_at: string;
}

interface ConceptEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relationship: 'leads_to' | 'requires' | 'related_to';
}

interface LayoutNode extends ConceptNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_W    = 160;
const NODE_H    = 60;
const COL_GAP   = 200;
const NODE_YGAP = 30;
const START_X   = 80;
const START_Y   = 60;
const LABEL_H   = 30;
const SVG_PAD   = 60;

// ── Chain helpers ─────────────────────────────────────────────────────────────

function computePrereqChain(nodeId: string, edges: ConceptEdge[]): { chainNodeIds: Set<string>; chainEdgeIds: Set<string> } {
  const chainNodeIds = new Set<string>();
  const chainEdgeIds = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.to_node_id === id && e.relationship === 'requires' && !chainNodeIds.has(e.from_node_id)) {
        chainNodeIds.add(e.from_node_id);
        chainEdgeIds.add(e.id);
        queue.push(e.from_node_id);
      }
    }
  }
  return { chainNodeIds, chainEdgeIds };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function masteryColor(pct: number): string {
  if (pct >= 80) return '#10B981';
  if (pct >= 60) return '#F59E0B';
  if (pct >= 40) return '#F97316';
  return '#EF4444';
}

function masteryLabel(pct: number): string {
  if (pct >= 80) return 'Mastered';
  if (pct >= 60) return 'Familiar';
  if (pct >= 40) return 'Learning';
  return 'Beginner';
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 2)   return 'Just now';
  if (mins < 60)  return `${mins} minutes ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 30)  return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

function computeLayout(nodes: ConceptNode[], collapsedSubjects?: Set<string>): LayoutNode[] {
  // Group by subject
  const subjectMap = new Map<string, ConceptNode[]>();
  for (const n of nodes) {
    if (!subjectMap.has(n.subject)) subjectMap.set(n.subject, []);
    subjectMap.get(n.subject)!.push(n);
  }

  const result: LayoutNode[] = [];
  let colIndex = 0;

  for (const [subject, subjectNodes] of subjectMap) {
    const x = START_X + colIndex * COL_GAP;
    const isCollapsed = collapsedSubjects?.has(subject) ?? false;
    // When collapsed: only lay out first node as the representative
    const nodesToLayout = isCollapsed ? subjectNodes.slice(0, 1) : subjectNodes;
    let y = START_Y + LABEL_H;
    for (const n of nodesToLayout) {
      result.push({ ...n, x, y, width: NODE_W, height: NODE_H });
      y += NODE_H + NODE_YGAP;
    }
    colIndex++;
  }

  return result;
}

function svgViewBox(nodes: LayoutNode[]): { x: number; y: number; w: number; h: number } {
  if (nodes.length === 0) return { x: 0, y: 0, w: 400, h: 300 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return {
    x: minX - SVG_PAD,
    y: minY - SVG_PAD,
    w: (maxX - minX) + SVG_PAD * 2,
    h: (maxY - minY) + SVG_PAD * 2,
  };
}

function cubicBezierPath(
  fx: number, fy: number,
  tx: number, ty: number,
): string {
  const cpOffset = Math.abs(tx - fx) * 0.45;
  const cp1x = fx + cpOffset;
  const cp2x = tx - cpOffset;
  return `M ${fx} ${fy} C ${cp1x} ${fy}, ${cp2x} ${ty}, ${tx} ${ty}`;
}

// ── Mastery Arc (180° semicircle) ─────────────────────────────────────────────

function MasteryArc({ pct, size = 120 }: { pct: number; size?: number }) {
  const color  = masteryColor(pct);
  const stroke = 8;
  const r      = (size - stroke) / 2;
  const cx     = size / 2;
  const cy     = size / 2;
  // 180° arc: start at left (180°) → end at right (0°), going through top
  // In SVG angles: start = Math.PI (left), sweep counter-clockwise to 0 (right)
  // We draw background arc then foreground arc
  const startAngle = Math.PI;   // left
  const endAngle   = 0;         // right (going counter-clockwise = up through top)

  function polarToXY(angle: number): [number, number] {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  // Background: full 180° from left to right going through top (counter-clockwise)
  const [bgX1, bgY1] = polarToXY(Math.PI);
  const [bgX2, bgY2] = polarToXY(0);

  // Foreground: pct fraction of the 180°
  // progress goes from left (π) counter-clockwise (decreasing angle) to 0
  const fgAngle = Math.PI - (pct / 100) * Math.PI;
  const [fgX, fgY] = polarToXY(fgAngle);

  const fgLargeArc = pct > 50 ? 1 : 0;

  return (
    <div className="flex flex-col items-center" style={{ width: size, height: size / 2 + 20 }}>
      <svg width={size} height={size / 2 + stroke} overflow="visible">
        {/* Background track */}
        <path
          d={`M ${bgX1} ${bgY1} A ${r} ${r} 0 0 1 ${bgX2} ${bgY2}`}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Foreground progress */}
        {pct > 0 && (
          <path
            d={`M ${bgX1} ${bgY1} A ${r} ${r} 0 ${fgLargeArc} 1 ${fgX} ${fgY}`}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        )}
      </svg>
      <div className="flex flex-col items-center -mt-1">
        <span className="text-2xl font-bold" style={{ color }}>{pct}%</span>
        <span className="text-xs mt-0.5" style={{ color }}>{masteryLabel(pct)}</span>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      {/* Constellation SVG */}
      <svg width="160" height="140" viewBox="0 0 160 140" className="mb-6 opacity-80">
        {/* Nodes */}
        {[
          [80, 20], [40, 60], [120, 60], [20, 110], [80, 100], [140, 110],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i === 0 ? 10 : 7}
            fill={['#5B6AF5','#8B5CF6','#10B981','#F59E0B','#F97316','#EF4444'][i]}
            opacity={0.85} />
        ))}
        {/* Edges */}
        {[
          [80,20,40,60], [80,20,120,60],
          [40,60,20,110], [40,60,80,100],
          [120,60,80,100], [120,60,140,110],
        ].map(([x1,y1,x2,y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(91,106,245,0.25)" strokeWidth={1.5} />
        ))}
        {/* Brain outline suggestion */}
        <ellipse cx={80} cy={70} rx={70} ry={55}
          fill="none" stroke="rgba(91,106,245,0.10)" strokeWidth={1.5}
          strokeDasharray="4 4" />
      </svg>

      <h2 className="text-xl font-bold text-white mb-2">Your knowledge map is empty</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
        Complete a tutoring session with Novo to start building your concept map.
      </p>
      <Link
        to="/tutoring"
        className="px-6 py-3 rounded-2xl text-white text-sm font-semibold"
        style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}
        onClick={() => track('concept_map_empty_cta')}
      >
        Start a Session →
      </Link>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  node,
  prereqNodes,
  onClose,
}: {
  node: ConceptNode;
  prereqNodes: ConceptNode[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const color = masteryColor(node.mastery_pct);

  function handleDrill() {
    track('concept_map_drill_started', { subject: node.subject, title: node.title });
    navigate(`/tutoring?subject=${encodeURIComponent(node.subject)}&topic=${encodeURIComponent(node.title)}&mode=drill`);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Sheet */}
      <motion.div
        className="relative w-full rounded-t-3xl px-5 pt-5 pb-10"
        style={{ maxHeight: '80vh', overflowY: 'auto', background: 'rgba(10,12,28,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1.5 rounded-full mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.2)' }} />

        {/* Close button */}
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <X size={16} className="text-muted-foreground" />
        </button>

        {/* Subject chip */}
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mb-3"
          style={{ background: `${color}18`, color }}>
          {node.subject}
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-4 leading-tight">{node.title}</h2>

        {/* Mastery arc */}
        <div className="flex justify-center mb-4">
          <MasteryArc pct={node.mastery_pct} size={130} />
        </div>

        {/* Description */}
        {node.description && (
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{node.description}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard icon={<BookOpen size={14} />} label="Sessions" value={node.times_studied} color="#5B6AF5" />
          <StatCard icon={<Zap size={14} />} label="Tests" value={node.times_tested} color="#8B5CF6" />
          <StatCard icon={<CheckCircle2 size={14} />} label="Correct" value={node.times_correct} color={color} />
        </div>

        {/* Prerequisite chain */}
        {prereqNodes.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: '#FBBF24' }}>
              <GitBranch size={13} />
              <span>Prerequisites</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {prereqNodes.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}
                >
                  <span className="text-sm text-white">{p.title}</span>
                  <span className="text-xs font-semibold ml-2 shrink-0" style={{ color: masteryColor(p.mastery_pct) }}>
                    {p.mastery_pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last studied */}
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <Clock size={14} />
          <span>Last studied: {relativeTime(node.last_studied_at)}</span>
        </div>

        {/* Drill button */}
        <button
          onClick={handleDrill}
          className="w-full py-3.5 rounded-2xl text-white text-sm font-bold"
          style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}
        >
          Start Drill
        </button>
      </motion.div>
    </motion.div>
  );
}

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col items-center gap-1"
      style={{ background: 'rgba(255,255,255,0.06)' }}
    >
      <div style={{ color }}>{icon}</div>
      <span className="text-base font-bold text-white">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Graph Component ────────────────────────────────────────────────────────────

interface GraphProps {
  nodes: LayoutNode[];
  edges: ConceptEdge[];
  activeSubject: string | null;
  onNodeTap: (node: ConceptNode) => void;
  lockedNodeIds?: Set<string>;
  recentlyUnlocked?: Set<string>;
  chainNodeIds?: Set<string>;
  chainEdgeIds?: Set<string>;
  collapsedSubjects?: Set<string>;
  onSubjectToggle?: (subject: string) => void;
  selectedNodeId?: string | null;
}

function ConceptGraph({ nodes, edges, activeSubject, onNodeTap, lockedNodeIds = new Set(), recentlyUnlocked = new Set(), chainNodeIds = new Set(), chainEdgeIds = new Set(), collapsedSubjects = new Set(), onSubjectToggle, selectedNodeId }: GraphProps) {
  const svgRef   = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Transform state via ref to avoid re-renders
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    moved: false,
    totalDelta: 0,
  });
  const pinch = useRef({ active: false, startDist: 0, startScale: 1 });
  // For double-tap detection
  const lastTap = useRef<number>(0);

  const vb = svgViewBox(nodes);

  // ── Apply transform to DOM ─────────────────────────────────────────────────

  const applyTransform = useCallback(() => {
    const g = groupRef.current;
    if (!g) return;
    const { x, y, scale } = transform.current;
    g.setAttribute('transform', `translate(${x},${y}) scale(${scale})`);
  }, []);

  // ── Fit all nodes on mount / when nodes change ─────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;

    const cw = container.clientWidth  || 375;
    const ch = container.clientHeight || 500;
    const sx = cw / vb.w;
    const sy = ch / vb.h;
    const scale = Math.min(sx, sy) * 0.9;
    const x = (cw - vb.w * scale) / 2 - vb.x * scale;
    const y = (ch - vb.h * scale) / 2 - vb.y * scale;

    transform.current = { x, y, scale };
    applyTransform();
  }, [nodes, vb.w, vb.h, vb.x, vb.y, applyTransform]);

  // ── Gesture: mouse drag ────────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent) {
    drag.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: transform.current.x,
      startPanY: transform.current.y,
      moved: false,
      totalDelta: 0,
    };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    drag.current.totalDelta = Math.sqrt(dx * dx + dy * dy);
    drag.current.moved = drag.current.totalDelta > 4;
    transform.current.x = drag.current.startPanX + dx;
    transform.current.y = drag.current.startPanY + dy;
    applyTransform();
  }

  function onMouseUp(e: React.MouseEvent) {
    drag.current.active = false;
    // If barely moved, treat as click — handled by node click handlers
    _ = e; // suppress unused warning
  }

  // ── Gesture: wheel zoom ────────────────────────────────────────────────────

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect    = svgRef.current!.getBoundingClientRect();
    const mouseX  = e.clientX - rect.left;
    const mouseY  = e.clientY - rect.top;
    const delta   = e.deltaY < 0 ? 1.08 : 0.93;
    const prevScale = transform.current.scale;
    const newScale  = Math.min(2.5, Math.max(0.4, prevScale * delta));
    const scaleDiff = newScale / prevScale;

    transform.current.x = mouseX - (mouseX - transform.current.x) * scaleDiff;
    transform.current.y = mouseY - (mouseY - transform.current.y) * scaleDiff;
    transform.current.scale = newScale;
    applyTransform();
  }

  // ── Gesture: double-click to reset ────────────────────────────────────────

  function onDoubleClick() {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;
    const cw = container.clientWidth  || 375;
    const ch = container.clientHeight || 500;
    const sx = cw / vb.w;
    const sy = ch / vb.h;
    const scale = Math.min(sx, sy) * 0.9;
    const x = (cw - vb.w * scale) / 2 - vb.x * scale;
    const y = (ch - vb.h * scale) / 2 - vb.y * scale;
    transform.current = { x, y, scale };
    applyTransform();
  }

  // ── Gesture: touch ────────────────────────────────────────────────────────

  function getTouchDist(touches: React.TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      drag.current = {
        active: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startPanX: transform.current.x,
        startPanY: transform.current.y,
        moved: false,
        totalDelta: 0,
      };
      pinch.current.active = false;

      // Double-tap detection
      const now = Date.now();
      if (now - lastTap.current < 300) {
        onDoubleClick();
      }
      lastTap.current = now;
    } else if (e.touches.length === 2) {
      drag.current.active = false;
      pinch.current = {
        active: true,
        startDist: getTouchDist(e.touches),
        startScale: transform.current.scale,
      };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 1 && drag.current.active) {
      const dx = e.touches[0].clientX - drag.current.startX;
      const dy = e.touches[0].clientY - drag.current.startY;
      drag.current.totalDelta = Math.sqrt(dx * dx + dy * dy);
      drag.current.moved = drag.current.totalDelta > 4;
      transform.current.x = drag.current.startPanX + dx;
      transform.current.y = drag.current.startPanY + dy;
      applyTransform();
    } else if (e.touches.length === 2 && pinch.current.active) {
      const dist      = getTouchDist(e.touches);
      const ratio     = dist / pinch.current.startDist;
      const newScale  = Math.min(2.5, Math.max(0.4, pinch.current.startScale * ratio));

      // Zoom toward midpoint
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect  = svgRef.current?.getBoundingClientRect();
      const ox    = rect ? midX - rect.left : midX;
      const oy    = rect ? midY - rect.top  : midY;

      const prevScale = transform.current.scale;
      const scaleDiff = newScale / prevScale;
      transform.current.x = ox - (ox - transform.current.x) * scaleDiff;
      transform.current.y = oy - (oy - transform.current.y) * scaleDiff;
      transform.current.scale = newScale;
      applyTransform();
    }
  }

  function onTouchEnd() {
    drag.current.active = false;
    pinch.current.active = false;
  }

  // ── Node tap ──────────────────────────────────────────────────────────────

  function handleNodeClick(node: ConceptNode) {
    // Only treat as tap if drag distance was small
    if (drag.current.totalDelta < 6) {
      onNodeTap(node);
    }
  }

  // ── Subject grouping for labels ───────────────────────────────────────────

  const subjectFirstNode = new Map<string, LayoutNode>();
  for (const n of nodes) {
    if (!subjectFirstNode.has(n.subject)) subjectFirstNode.set(n.subject, n);
  }

  // ── Edge rendering ────────────────────────────────────────────────────────

  const nodeById = new Map<string, LayoutNode>(nodes.map(n => [n.id, n]));

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none' }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ cursor: 'grab', userSelect: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="rgba(91,106,245,0.5)" />
          </marker>
        </defs>

        {/* Main transform group */}
        <g ref={groupRef}>
          {/* Edges */}
          {edges.map(edge => {
            const fromNode = nodeById.get(edge.from_node_id);
            const toNode   = nodeById.get(edge.to_node_id);
            if (!fromNode || !toNode) return null;

            const fx = fromNode.x + fromNode.width;
            const fy = fromNode.y + fromNode.height / 2;
            const tx = toNode.x;
            const ty = toNode.y + toNode.height / 2;
            const isChain = chainEdgeIds.has(edge.id);

            return (
              <path
                key={edge.id}
                d={cubicBezierPath(fx, fy, tx, ty)}
                fill="none"
                stroke={isChain ? '#FBBF24' : 'rgba(91,106,245,0.35)'}
                strokeWidth={isChain ? 2.5 : 2}
                strokeDasharray={isChain ? '6 3' : undefined}
                markerEnd="url(#arrow)"
                style={{ transition: 'stroke 0.25s' }}
              />
            );
          })}

          {/* Subject labels — clickable to collapse/expand */}
          {Array.from(subjectFirstNode.entries()).map(([subject, n]) => {
            const isCollapsed = collapsedSubjects.has(subject);
            return (
              <g
                key={`label-${subject}`}
                style={{ cursor: onSubjectToggle ? 'pointer' : 'default' }}
                onClick={() => onSubjectToggle?.(subject)}
              >
                <rect
                  x={n.x} y={n.y - LABEL_H - 2}
                  width={NODE_W} height={LABEL_H - 4}
                  rx={8} ry={8}
                  fill="rgba(91,106,245,0.08)"
                />
                <text
                  x={n.x + NODE_W / 2 - 8}
                  y={n.y - 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight="600"
                  fill="rgba(91,106,245,0.85)"
                  style={{ pointerEvents: 'none' }}
                >
                  {subject}
                </text>
                <text
                  x={n.x + NODE_W - 10}
                  y={n.y - 14}
                  textAnchor="middle"
                  fontSize={12}
                  fill="rgba(91,106,245,0.7)"
                  style={{ pointerEvents: 'none' }}
                >
                  {isCollapsed ? '▶' : '▼'}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isActive  = activeSubject === null || node.subject === activeSubject;
            const isLocked  = lockedNodeIds.has(node.id);
            const isNewlyUnlocked = recentlyUnlocked.has(node.id);
            const isInChain = chainNodeIds.has(node.id);
            const isSelected = selectedNodeId === node.id;
            const color     = isLocked ? '#6B7280' : masteryColor(node.mastery_pct);
            const fillColor = isSelected ? `${color}35` : isLocked ? 'rgba(107,114,128,0.08)' : isInChain ? 'rgba(251,191,36,0.12)' : isActive ? `${color}22` : 'rgba(255,255,255,0.04)';
            const stroke    = isSelected ? color : isLocked ? 'rgba(107,114,128,0.4)' : isInChain ? '#FBBF24' : isActive ? color : 'rgba(255,255,255,0.15)';
            const textColor = isLocked ? 'rgba(255,255,255,0.3)' : isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleNodeClick(node)}
              >
                {/* Shadow */}
                <rect
                  x={2} y={3}
                  width={NODE_W} height={NODE_H}
                  rx={12} ry={12}
                  fill="rgba(0,0,0,0.06)"
                />
                {/* Card */}
                <rect
                  x={0} y={0}
                  width={NODE_W} height={NODE_H}
                  rx={12} ry={12}
                  fill={fillColor}
                  stroke={stroke}
                  strokeWidth={isActive ? 1.5 : 1}
                />
                {/* Mastery bar at bottom */}
                {isActive && (
                  <>
                    <rect
                      x={10} y={NODE_H - 8}
                      width={NODE_W - 20} height={4}
                      rx={2}
                      fill="rgba(255,255,255,0.1)"
                    />
                    <rect
                      x={10} y={NODE_H - 8}
                      width={Math.max(4, (NODE_W - 20) * node.mastery_pct / 100)}
                      height={4}
                      rx={2}
                      fill={color}
                    />
                  </>
                )}
                {/* Title */}
                <text
                  x={NODE_W / 2}
                  y={22}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="700"
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >
                  {node.title.length > 22 ? node.title.slice(0, 21) + '…' : node.title}
                </text>
                {/* Mastery pct or lock icon */}
                {isLocked ? (
                  <text
                    x={NODE_W / 2}
                    y={38}
                    textAnchor="middle"
                    fontSize={13}
                    style={{ pointerEvents: 'none' }}
                  >
                    🔒
                  </text>
                ) : isActive && (
                  <text
                    x={NODE_W / 2}
                    y={37}
                    textAnchor="middle"
                    fontSize={9}
                    fill={color}
                    fontWeight="600"
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.mastery_pct}%
                  </text>
                )}

                {/* Unlock sparkle animation */}
                {isNewlyUnlocked && (
                  <>
                    {[0, 1, 2, 3].map(i => (
                      <circle
                        key={i}
                        cx={NODE_W / 2 + (i % 2 === 0 ? -20 : 20)}
                        cy={NODE_H / 2 + (i < 2 ? -15 : 15)}
                        r={3}
                        fill="#FBBF24"
                        opacity={0.9}
                        style={{
                          animation: `sparkle 0.8s ${i * 0.15}s ease-out both`,
                        }}
                      />
                    ))}
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ── Suppress unused var lint warning for mouse events ─────────────────────────
let _: unknown;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConceptMapPage() {
  const { user } = useAuth();
  const [nodes, setNodes]               = useState<ConceptNode[]>([]);
  const [edges, setEdges]               = useState<ConceptEdge[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ConceptNode | null>(null);
  const [recentlyUnlocked, setRecentlyUnlocked] = useState<Set<string>>(new Set());
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const [nodesRes, edgesRes] = await Promise.all([
          supabase
            .from('concept_nodes')
            .select('*')
            .eq('user_id', user!.id)
            .order('subject', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase
            .from('concept_edges')
            .select('*'),
        ]);

        if (!mountedRef.current) return;

        if (nodesRes.error) throw nodesRes.error;
        if (edgesRes.error) throw edgesRes.error;

        const fetchedNodes = (nodesRes.data ?? []) as ConceptNode[];
        const fetchedEdges = (edgesRes.data ?? []) as ConceptEdge[];

        // Filter edges to only include those between user's nodes
        const nodeIds = new Set(fetchedNodes.map(n => n.id));
        const filteredEdges = fetchedEdges.filter(
          e => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id)
        );

        setNodes(fetchedNodes);
        setEdges(filteredEdges);
        track('concept_map_viewed', { node_count: fetchedNodes.length });
      } catch (err) {
        console.error('[ConceptMapPage] fetch error:', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    load();
  }, [user]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const subjects = Array.from(new Set(nodes.map(n => n.subject))).sort();

  const visibleNodes = activeSubject
    ? nodes.filter(n => n.subject === activeSubject)
    : nodes;

  const layoutNodes = computeLayout(visibleNodes, collapsedSubjects);

  const visibleEdges = activeSubject
    ? edges.filter(e => {
        const fromNode = nodes.find(n => n.id === e.from_node_id);
        const toNode   = nodes.find(n => n.id === e.to_node_id);
        return fromNode?.subject === activeSubject && toNode?.subject === activeSubject;
      })
    : edges;

  // ── Prerequisite chain for selected node ─────────────────────────────────
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // ── Prerequisite locking: node is locked if any `requires` source < 70% ──
  const lockedNodeIds = new Set<string>();
  for (const edge of edges) {
    if (edge.relationship !== 'requires') continue;
    const source = nodeById.get(edge.from_node_id);
    if (source && source.mastery_pct < 70) {
      lockedNodeIds.add(edge.to_node_id);
    }
  }
  // Check if any newly locked node was just unlocked (mastery just hit 70)
  // — trigger the unlock animation set
  useEffect(() => {
    const justUnlocked = new Set<string>();
    for (const edge of edges) {
      if (edge.relationship !== 'requires') continue;
      const source = nodeById.get(edge.from_node_id);
      if (source && source.mastery_pct >= 70) {
        const target = edge.to_node_id;
        if (recentlyUnlocked.has(target)) continue;
        justUnlocked.add(target);
      }
    }
    if (justUnlocked.size > 0) {
      setRecentlyUnlocked(prev => new Set([...prev, ...justUnlocked]));
      setTimeout(() => setRecentlyUnlocked(new Set()), 2500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes]);
  const { chainNodeIds, chainEdgeIds } = selectedNode
    ? computePrereqChain(selectedNode.id, edges)
    : { chainNodeIds: new Set<string>(), chainEdgeIds: new Set<string>() };
  const prereqNodes = Array.from(chainNodeIds)
    .map(id => nodeById.get(id))
    .filter((n): n is ConceptNode => n !== undefined);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col"
      style={{ height: '100dvh', background: 'linear-gradient(180deg, #0A0F25 0%, #080C1A 100%)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 pt-safe shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 12 }}
      >
        <Link
          to="/tools"
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ArrowLeft size={18} className="text-white" />
        </Link>

        <h1 className="text-base font-bold text-white">Concept Map</h1>

        <div
          className="px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}
        >
          {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}
        </div>
      </div>

      {/* ── Subject filter ──────────────────────────────────────────────── */}
      {!loading && nodes.length > 0 && (
        <div
          className="px-4 pb-3 shrink-0 overflow-x-auto"
          style={{ display: 'flex', gap: 8, scrollbarWidth: 'none' }}
        >
          <FilterPill
            label="All"
            active={activeSubject === null}
            onClick={() => setActiveSubject(null)}
          />
          {subjects.map(s => (
            <FilterPill
              key={s}
              label={s}
              active={activeSubject === s}
              onClick={() => {
                setActiveSubject(prev => prev === s ? null : s);
                track('concept_map_subject_filtered', { subject: s });
              }}
            />
          ))}
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <LoadingSpinner />
        ) : nodes.length === 0 ? (
          <EmptyState />
        ) : (
          <ConceptGraph
            nodes={layoutNodes}
            edges={visibleEdges}
            activeSubject={activeSubject}
            lockedNodeIds={lockedNodeIds}
            recentlyUnlocked={recentlyUnlocked}
            chainNodeIds={chainNodeIds}
            chainEdgeIds={chainEdgeIds}
            collapsedSubjects={collapsedSubjects}
            selectedNodeId={selectedNode?.id}
            onSubjectToggle={subject => {
              setCollapsedSubjects(prev => {
                const next = new Set(prev);
                if (next.has(subject)) next.delete(subject); else next.add(subject);
                return next;
              });
              track('concept_map_subject_toggled', { subject });
            }}
            onNodeTap={node => {
              setSelectedNode(node);
              track('concept_map_node_tapped', {
                title: node.title,
                subject: node.subject,
                locked: lockedNodeIds.has(node.id),
              });
            }}
          />
        )}
      </div>

      {/* ── Hint ────────────────────────────────────────────────────────── */}
      {!loading && nodes.length > 0 && (
        <div
          className="shrink-0 text-center text-[11px] text-muted-foreground pb-safe"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)', paddingTop: 4 }}
        >
          Drag to pan · Pinch or scroll to zoom · Double-tap to fit
        </div>
      )}

      {/* ── Detail panel ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            prereqNodes={prereqNodes}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </AnimatePresence>
      <style>{`
        @keyframes sparkle {
          0%   { transform: scale(0) translate(0,0); opacity: 1; }
          100% { transform: scale(1.5) translate(var(--sx,0),var(--sy,-20px)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Filter Pill ───────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
      style={{
        background: active ? 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' : 'rgba(15,20,45,0.7)',
        color:      active ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
        border:     active ? 'none' : '1px solid rgba(255,255,255,0.1)',
        boxShadow:  active ? '0 2px 8px rgba(91,106,245,0.3)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

// ── Loading Spinner ───────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <motion.div
        className="w-10 h-10 rounded-full border-4 border-t-transparent"
        style={{ borderColor: '#5B6AF5', borderTopColor: 'transparent' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
      <span className="text-sm text-muted-foreground">Loading your knowledge map…</span>
    </div>
  );
}
