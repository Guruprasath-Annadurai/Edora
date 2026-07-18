import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, TrendingUp, Info, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Monte Carlo engine ────────────────────────────────────────────────────────

function boxMuller(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

interface SimConfig {
  totalStudents: number;
  meanScore: number;
  sdScore: number;
  maxMarks: number;
}

const EXAM_CONFIGS: Record<string, SimConfig> = {
  jee_mains: {
    totalStudents: 1_200_000,
    meanScore:     88,
    sdScore:       52,
    maxMarks:      300,
  },
  jee_advanced: {
    totalStudents: 185_000,
    meanScore:     103,
    sdScore:       58,
    maxMarks:      360,
  },
  neet: {
    totalStudents: 2_300_000,
    meanScore:     480,
    sdScore:       110,
    maxMarks:      720,
  },
};

interface SimResult {
  p10Rank: number;
  p25Rank: number;
  p50Rank: number;
  p75Rank: number;
  p90Rank: number;
  percentile: number;
  rankBuckets: number[]; // 20 buckets for bell curve
  topColleges: string[];
}

function runMonteCarlo(score: number, examKey: string, trials = 1000): SimResult {
  const cfg = EXAM_CONFIGS[examKey];
  const ranks: number[] = [];

  for (let t = 0; t < trials; t++) {
    // Add realistic measurement noise to the student's score (±5 marks estimation error)
    const studentScore = score + boxMuller() * 5;
    // Generate a sample population
    let studentsAbove = 0;
    const sampleSize = Math.min(50000, cfg.totalStudents);
    for (let i = 0; i < sampleSize; i++) {
      const s = cfg.meanScore + boxMuller() * cfg.sdScore;
      if (s > studentScore) studentsAbove++;
    }
    // Scale up to full population
    const scaledAbove = Math.round((studentsAbove / sampleSize) * cfg.totalStudents);
    ranks.push(Math.max(1, scaledAbove + 1));
  }

  ranks.sort((a, b) => a - b);
  const pct = (i: number) => ranks[Math.floor((i / 100) * trials)];

  // Build bell curve buckets
  const min = Math.max(0, score - cfg.sdScore * 2);
  const max = Math.min(cfg.maxMarks, score + cfg.sdScore * 2);
  const bucketSize = (max - min) / 20;
  const buckets: number[] = new Array(20).fill(0);
  for (let i = 0; i < 5000; i++) {
    const s = cfg.meanScore + boxMuller() * cfg.sdScore;
    const bucket = Math.floor((s - min) / bucketSize);
    if (bucket >= 0 && bucket < 20) buckets[bucket]++;
  }

  const percentile = Math.round((1 - pct(50) / cfg.totalStudents) * 100 * 10) / 10;

  // College predictions
  const colleges: Record<string, number[]> = {
    jee_mains: [
      // [name, rank threshold]
    ],
    jee_advanced: [],
    neet: [],
  };
  void colleges;

  const topColleges = getCollegePredictions(examKey, pct(50));

  return {
    p10Rank: pct(10),
    p25Rank: pct(25),
    p50Rank: pct(50),
    p75Rank: pct(75),
    p90Rank: pct(90),
    percentile,
    rankBuckets: buckets,
    topColleges,
  };
}

function getCollegePredictions(examKey: string, medianRank: number): string[] {
  if (examKey === 'jee_advanced') {
    if (medianRank <= 100)   return ['IIT Bombay CSE', 'IIT Delhi CSE', 'IIT Madras CSE'];
    if (medianRank <= 500)   return ['IIT Bombay EE', 'IIT Kharagpur CSE', 'IIT Kanpur CS'];
    if (medianRank <= 1500)  return ['IIT Roorkee CSE', 'IIT Guwahati CSE', 'IIT BHU CSE'];
    if (medianRank <= 5000)  return ['IIT Dhanbad', 'IIT Jodhpur', 'IIT Tirupati'];
    if (medianRank <= 15000) return ['IIT Palakkad', 'IIT Dharwad', 'NIT Trichy (via Mains)'];
    return ['NIT via JEE Mains', 'BITS Pilani (BITSAT)', 'Consider retrying'];
  }
  if (examKey === 'jee_mains') {
    if (medianRank <= 2500)   return ['NIT Trichy CSE', 'NIT Warangal CSE', 'NIT Surathkal CSE'];
    if (medianRank <= 10000)  return ['NIT Calicut CSE', 'NIT Rourkela CSE', 'BITS Hyderabad'];
    if (medianRank <= 25000)  return ['NIT Jaipur', 'NIT Durgapur', 'IIIT Hyderabad'];
    if (medianRank <= 80000)  return ['NITs (non-CS)', 'GFTIs', 'State Engineering Colleges'];
    return ['State engineering colleges', 'Private deemed universities'];
  }
  if (examKey === 'neet') {
    if (medianRank <= 1500)   return ['AIIMS Delhi', 'JIPMER', 'AIIMS Jodhpur'];
    if (medianRank <= 10000)  return ['Top govt MBBS colleges', 'State quota seats'];
    if (medianRank <= 50000)  return ['Govt MBBS via state quota', 'Central pool seats'];
    if (medianRank <= 150000) return ['Govt BDS / AYUSH', 'Private MBBS (₹ high)'];
    return ['Consider repeating NEET', 'Allied health sciences'];
  }
  return [];
}

// ── Bell curve SVG ────────────────────────────────────────────────────────────

function BellCurve({ buckets, studentBucket, color }: {
  buckets: number[];
  studentBucket: number;
  color: string;
}) {
  const max = Math.max(...buckets, 1);
  const h = 80;
  const w = 280;
  const bw = w / buckets.length;

  return (
    <svg width={w} height={h + 20} viewBox={`0 0 ${w} ${h + 20}`} style={{ overflow: 'visible' }}>
      {buckets.map((v, i) => {
        const barH = (v / max) * h;
        const isStudent = i === studentBucket;
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={h - barH + 10}
            width={bw - 2}
            height={barH}
            rx={2}
            fill={isStudent ? color : `${color}44`}
          />
        );
      })}
      {/* Student marker */}
      <line
        x1={studentBucket * bw + bw / 2}
        y1={6}
        x2={studentBucket * bw + bw / 2}
        y2={h + 12}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="4 3"
      />
      <text
        x={studentBucket * bw + bw / 2}
        y={4}
        textAnchor="middle"
        fill={color}
        fontSize={10}
        fontWeight={700}>
        YOU
      </text>
    </svg>
  );
}

// ── Score input ───────────────────────────────────────────────────────────────

interface ScoreInputProps {
  label: string;
  max: number;
  value: number;
  onChange: (v: number) => void;
  color: string;
}
function ScoreInput({ label, max, value, onChange, color }: ScoreInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color }}>{label}</span>
        <span className="text-lg font-black text-white tabular-nums">{value}<span className="text-white/30 text-sm font-normal">/{max}</span></span>
      </div>
      <input
        type="range"
        min={-max * 0.1}
        max={max}
        step={4}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} ${((value - (-max * 0.1)) / (max * 1.1)) * 100}%, var(--ink-100) 0%)`,
          WebkitAppearance: 'none',
        }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RankPredictorPage() {
  const [examKey, setExamKey]   = useState<string>('jee_mains');
  const [examOpen, setExamOpen] = useState(false);
  const [physics, setPhysics]   = useState(60);
  const [chemistry, setChemistry] = useState(55);
  const [maths, setMaths]       = useState(70);

  const cfg = EXAM_CONFIGS[examKey];
  const subjectMax = examKey === 'neet' ? 180 : examKey === 'jee_advanced' ? 60 : 100;

  const totalScore = Math.max(0, physics + chemistry + maths);

  const result = useMemo(() => {
    if (totalScore < 0) return null;
    return runMonteCarlo(totalScore, examKey, 800);
  }, [totalScore, examKey]);

  const studentBucket = result
    ? Math.min(19, Math.floor(((totalScore - (cfg.meanScore - cfg.sdScore * 2)) /
        (cfg.sdScore * 4)) * 20))
    : 10;

  const examLabels: Record<string, string> = {
    jee_mains:    'JEE Mains 2025',
    jee_advanced: 'JEE Advanced 2025',
    neet:         'NEET 2025',
  };

  const rankColor =
    (result?.p50Rank ?? 999999) < 1000 ? '#10B981' :
    (result?.p50Rank ?? 999999) < 10000 ? '#5B6AF5' :
    (result?.p50Rank ?? 999999) < 50000 ? '#F59E0B' : '#EF4444';

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link aria-label="Go back" to="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={18} className="text-white" strokeWidth={1.75} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" strokeWidth={2} />
              <h1 className="font-heading font-extrabold text-white text-lg">Rank Predictor</h1>
            </div>
            <p className="text-xs text-white/40">Monte Carlo simulation · 800 runs</p>
          </div>
        </div>
      </div>

      <div className="flex-1 native-scroll px-4 pb-nav flex flex-col gap-4">

        {/* Exam picker */}
        <div className="relative">
          <button
            onClick={() => setExamOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl"
            style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-100)' }}>
            <span className="font-bold text-white">{examLabels[examKey]}</span>
            <ChevronDown size={16} className="text-white/40" style={{ transform: examOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
          </button>
          <AnimatePresence>
            {examOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-full left-0 right-0 z-10 mt-1 rounded-2xl overflow-hidden"
                style={{ background: 'var(--hdr-b-980)', border: '1px solid var(--ink-100)' }}>
                {Object.entries(examLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setExamKey(key); setExamOpen(false); }}
                    className="w-full px-4 py-3 text-left text-sm font-medium hover:bg-white/5 transition-colors"
                    style={{ color: key === examKey ? '#A0AEFF' : 'var(--ink-700)' }}>
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Score inputs */}
        <div className="p-4 rounded-3xl flex flex-col gap-5"
          style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
          <h3 className="text-white font-bold text-sm">Expected Marks</h3>
          <ScoreInput label="Physics" max={subjectMax} value={physics} onChange={setPhysics} color="#5B6AF5" />
          <ScoreInput label="Chemistry" max={subjectMax} value={chemistry} onChange={setChemistry} color="#10B981" />
          <ScoreInput label={examKey === 'neet' ? 'Biology' : 'Maths'} max={subjectMax} value={maths} onChange={setMaths} color="#F59E0B" />

          <div className="pt-1 border-t" style={{ borderColor: 'var(--ink-070)' }}>
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-sm">Total Score</span>
              <span className="text-2xl font-black text-white">{totalScore}
                <span className="text-sm font-normal text-white/30">/{cfg.maxMarks}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <motion.div
            key={totalScore + examKey}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-3">

            {/* Rank range card */}
            <div className="p-5 rounded-3xl"
              style={{ background: `linear-gradient(135deg, ${rankColor}18, ${rankColor}08)`, border: `1px solid ${rankColor}33` }}>
              <p className="text-xs font-bold mb-1" style={{ color: `${rankColor}cc`, letterSpacing: 1 }}>PREDICTED RANK RANGE</p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-4xl font-black tabular-nums" style={{ color: rankColor }}>
                  {result.p25Rank.toLocaleString('en-IN')}
                </span>
                <span className="text-lg text-white/40 font-bold">–</span>
                <span className="text-4xl font-black tabular-nums" style={{ color: rankColor }}>
                  {result.p75Rank.toLocaleString('en-IN')}
                </span>
              </div>
              <p className="text-white/50 text-xs">50% confidence interval · Percentile: {result.percentile}%</p>
            </div>

            {/* Detailed percentiles */}
            <div className="p-4 rounded-2xl" style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
              <p className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider">Rank distribution</p>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Best case (P10)', rank: result.p10Rank, pct: '10%' },
                  { label: 'Likely best (P25)', rank: result.p25Rank, pct: '25%' },
                  { label: 'Median estimate', rank: result.p50Rank, pct: '50%' },
                  { label: 'Likely worst (P75)', rank: result.p75Rank, pct: '75%' },
                  { label: 'Worst case (P90)', rank: result.p90Rank, pct: '90%' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-xs text-white/50">{row.label}</span>
                    <span className="text-sm font-bold text-white tabular-nums">
                      {row.rank.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bell curve */}
            <div className="p-4 rounded-2xl" style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
              <p className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider">Score distribution</p>
              <div className="flex justify-center">
                <BellCurve buckets={result.rankBuckets} studentBucket={Math.max(0, Math.min(19, studentBucket))} color={rankColor} />
              </div>
              <p className="text-center text-xs text-white/30 mt-2">Your position vs all {(cfg.totalStudents / 100000).toFixed(1)}L students</p>
            </div>

            {/* College predictions */}
            {result.topColleges.length > 0 && (
              <div className="p-4 rounded-2xl" style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
                <p className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider">Likely colleges at median rank</p>
                {result.topColleges.map((college, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    <span className="text-primary text-sm">•</span>
                    <span className="text-white/80 text-sm">{college}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <Info size={14} color="#FCD34D" className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(252,211,77,0.8)' }}>
                Monte Carlo simulation based on historical JEE/NEET score distributions. Actual rank depends on difficulty, number of students, and cut-off changes. Use as guidance only.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
