export function ScoreArc({ pct, size = 80 }: { pct: number; size?: number }) {
  const stroke = 6;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color  = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0"
        style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--ink-080)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
      </svg>
      <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
}
