import { motion } from 'framer-motion';
import { Globe, FileText, ScanLine, BookMarked, PenLine, Clock, FileScan, Brain, Map, AlertTriangle, GraduationCap, Layers, Sparkles, Network, Mic, PenTool, Camera, BookText, Youtube, Zap, Swords, Trophy, BookOpen, Flame, TrendingUp, Activity, BarChart2, FileOutput, Users, Radar, BookCopy, History, Play, TestTube2, Sword, Rss, BarChart, UserPlus, Handshake, PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';

const tools = [
  {
    title: 'PDF Study Pack',
    desc: 'Upload any PDF → instant flashcards, quiz & summary',
    icon: FileScan,
    to: '/study-pack',
    color: '#F59E0B',
    bg: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(239,68,68,0.18))',
    border: 'rgba(245,158,11,0.35)',
    large: true,
  },
  {
    title: 'Exam Simulator',
    desc: 'Timed mock tests with AI analysis',
    icon: Clock,
    to: '/exam-simulator',
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(59,130,246,0.2))',
    border: 'rgba(124,58,237,0.3)',
    large: true,
  },
  {
    title: 'Notes Scanner',
    desc: 'OCR handwriting to text',
    icon: ScanLine,
    to: '/scanner',
    color: '#06B6D4',
    bg: 'rgba(6,182,212,0.12)',
    border: 'rgba(6,182,212,0.2)',
    large: false,
  },
  {
    title: 'Mistake Journal',
    desc: 'Track & fix your errors',
    icon: PenLine,
    to: '/journal',
    color: '#EC4899',
    bg: 'rgba(236,72,153,0.12)',
    border: 'rgba(236,72,153,0.2)',
    large: false,
  },
  {
    title: 'Study Notes',
    desc: 'Organize your notes',
    icon: FileText,
    to: '/notes',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.12)',
    border: 'rgba(16,185,129,0.2)',
    large: false,
  },
  {
    title: 'Mnemonic AI',
    desc: 'AI memory tricks',
    icon: BookMarked,
    to: '/mnemonics',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.2)',
    large: false,
  },
  {
    title: 'Browser',
    desc: 'Research & references',
    icon: Globe,
    to: '/browser',
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.2)',
    large: false,
  },
];

const TUTOR_TOOLS = [
  {
    title: 'Novo Tutoring',
    desc:  'Structured 1-on-1 sessions with Socratic mode',
    icon:  Brain,
    to:    '/tutoring',
    color: '#5B6AF5',
    bg:    'linear-gradient(135deg, rgba(91,106,245,0.18), rgba(139,92,246,0.18))',
    border:'rgba(91,106,245,0.35)',
  },
  {
    title: 'Concept Map',
    desc:  'Live knowledge graph coloured by mastery',
    icon:  Map,
    to:    '/concept-map',
    color: '#06B6D4',
    bg:    'rgba(6,182,212,0.12)',
    border:'rgba(6,182,212,0.25)',
  },
  {
    title: 'Error Patterns',
    desc:  'Detect & drill your recurring mistakes',
    icon:  AlertTriangle,
    to:    '/error-patterns',
    color: '#F97316',
    bg:    'rgba(249,115,22,0.12)',
    border:'rgba(249,115,22,0.25)',
  },
];

const VOICE_TOOLS = [
  {
    title: 'Novo Live',
    desc:  'Full voice lesson — Novo teaches & quizzes you',
    icon:  Mic,
    to:    '/novo-live',
    color: '#EF4444',
    bg:    'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(245,158,11,0.18))',
    border:'rgba(239,68,68,0.35)',
    large: true,
  },
  {
    title: 'Whiteboard',
    desc:  'Draw equations — Novo spots errors',
    icon:  PenTool,
    to:    '/whiteboard',
    color: '#8B5CF6',
    bg:    'rgba(139,92,246,0.12)',
    border:'rgba(139,92,246,0.25)',
  },
  {
    title: 'Photo Solver',
    desc:  'Snap a problem — get step-by-step solution',
    icon:  Camera,
    to:    '/photo-solver',
    color: '#06B6D4',
    bg:    'rgba(6,182,212,0.12)',
    border:'rgba(6,182,212,0.25)',
  },
  {
    title: 'Novo Reads',
    desc:  'Paste text — Novo explains as you read',
    icon:  BookText,
    to:    '/novo-reads',
    color: '#10B981',
    bg:    'rgba(16,185,129,0.12)',
    border:'rgba(16,185,129,0.25)',
  },
  {
    title: 'Video Companion',
    desc:  'YouTube lecture → summary & flashcards',
    icon:  Youtube,
    to:    '/video-companion',
    color: '#F59E0B',
    bg:    'rgba(245,158,11,0.12)',
    border:'rgba(245,158,11,0.25)',
  },
];

const LEARNING_PATH_TOOLS = [
  {
    title: 'Curricula',
    desc:  '80+ exam boards worldwide — enroll & track',
    icon:  GraduationCap,
    to:    '/curriculum',
    color: '#10B981',
    bg:    'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.18))',
    border:'rgba(16,185,129,0.35)',
    large: true,
  },
  {
    title: 'Spaced Review',
    desc:  'SM-2 flashcard review queue',
    icon:  Layers,
    to:    '/spaced-review',
    color: '#8B5CF6',
    bg:    'rgba(139,92,246,0.12)',
    border:'rgba(139,92,246,0.25)',
  },
  {
    title: 'My Learning Style',
    desc:  'How Novo adapts to you',
    icon:  Sparkles,
    to:    '/learning-style',
    color: '#F59E0B',
    bg:    'rgba(245,158,11,0.12)',
    border:'rgba(245,158,11,0.25)',
  },
  {
    title: 'Subject Map',
    desc:  'Knowledge unlock dependency graph',
    icon:  Network,
    to:    '/subject-map',
    color: '#EC4899',
    bg:    'rgba(236,72,153,0.12)',
    border:'rgba(236,72,153,0.25)',
  },
];

export default function ToolsPage() {
  return (
    <div className="h-full native-scroll px-4 pt-5 pb-nav flex flex-col gap-5" style={{ background: 'transparent' }}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', boxShadow: '0 4px 16px rgba(236,72,153,0.3)' }}>
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Power Features</p>
          <h1 className="font-heading text-2xl font-extrabold text-foreground leading-tight">Study Tools</h1>
        </div>
      </div>

      {/* ── Analytics & Reporting ─────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          Analytics & Reporting
        </p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to="/exam-prediction">
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(16,185,129,0.15)' }}>
                <TrendingUp size={20} style={{ color: '#34D399' }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm leading-tight">Exam Score Predictor</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">AI projects your likely grade + daily study plan</p>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[
            { title: 'Weakness Radar', desc: 'Spider chart · JEE topic weights', icon: Radar, to: '/weakness-radar', color: '#A78BFA', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { title: 'Attention Heatmap', desc: 'Topics you\'ve been avoiding', icon: Activity, to: '/attention-heatmap', color: '#F87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
            { title: 'Confidence Score', desc: 'Speed × accuracy analysis', icon: BarChart2, to: '/confidence', color: '#38BDF8', bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.25)' },
          ].map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { title: 'Parent Report', desc: 'Weekly AI summary for parents', icon: Users, to: '/parent', color: '#C4B5FD', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { title: 'Teacher Export', desc: 'Full mastery report PDF', icon: FileOutput, to: '/teacher-export', color: '#FBBF24', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
          ].map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 2) * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Exam Prep ─────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          Exam Prep
        </p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to="/mock-test">
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(96,165,250,0.15)' }}>
                <TestTube2 size={20} style={{ color: '#60A5FA' }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm leading-tight">Mock Full Test</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">3hr JEE / 3.5hr NEET timed simulation · auto-score + percentile</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.2)', color: '#60A5FA' }}>NEW</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[
            { title: 'PYQ Bank', desc: '10yr JEE·NEET·CBSE archive', icon: History, to: '/pyq-bank', color: '#FB923C', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
            { title: 'AI Quiz Bank', desc: 'Infinite adaptive questions', icon: Brain, to: '/ai-quiz', color: '#A78BFA', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { title: 'Mains & Long-Answer', desc: 'UPSC Essay/GS · CBSE Boards · AI feedback', icon: PenLine, to: '/upsc-mains', color: '#818CF8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.25)' },
          ].map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { title: 'NCERT Chapters', desc: 'Class 6–12 · 20 MCQs + flashcards', icon: BookCopy, to: '/ncert-chapters', color: '#34D399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)' },
            { title: 'Concept Videos', desc: '60-sec explainers for hard topics', icon: Play, to: '/concept-videos', color: '#F472B6', bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.25)' },
          ].map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 2) * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Competitive & Social ──────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          Competitive & Social
        </p>
        {/* Leaderboard — wide featured card */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to="/leaderboard">
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(96,165,250,0.15)' }}>
                <BarChart size={20} style={{ color: '#60A5FA' }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm leading-tight">Leaderboard</p>
                <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--ink-450)' }}>Global · State · City · School · Friends rankings</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.2)', color: '#60A5FA' }}>LIVE</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {[
            { title: '1v1 Battle', desc: 'Real-time quiz duel', icon: Sword, to: '/battle', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
            { title: 'Study Circles', desc: 'Sync sprints · group streak', icon: Users, to: '/circles', color: '#34D399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)' },
            { title: 'Achievement Feed', desc: 'Cheer your peers', icon: Rss, to: '/feed', color: '#F472B6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.25)' },
            { title: 'Friends', desc: 'Add, find, nudge friends', icon: UserPlus, to: '/friends', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.25)' },
            { title: 'Study Buddy', desc: 'AI-paired accountability partner', icon: Handshake, to: '/study-buddy', color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)' },
            { title: 'Live Events', desc: 'National synchronized quiz', icon: PartyPopper, to: '/live-event', color: '#FBBF24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)' },
          ].map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Gamified & Social ──────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          Gamified & Social
        </p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to="/challenges">
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <Zap size={20} style={{ color: '#FBBF24' }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm leading-tight">Daily Boss Challenge</p>
                <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--ink-450)' }}>Hardest problem of the day · 2× XP · timed</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.2)', color: '#FBBF24' }}>2× XP</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[
            { title: 'Tournament', desc: 'Weekly ranked quiz', icon: Trophy, to: '/tournament', color: '#C4B5FD', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { title: 'Debate Mode', desc: 'Argue vs Novo', icon: Swords, to: '/debate', color: '#F87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
          ].map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { title: 'Story Mode', desc: 'Learn through adventure', icon: BookOpen, to: '/story-mode', color: '#34D399', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
            { title: 'Streak Challenges', desc: '7-day focus sprints', icon: Flame, to: '/streaks', color: '#FB923C', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
          ].map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 2) * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Voice & Multimodal ──────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          Voice & Multimodal
        </p>
        {/* Featured large */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to={VOICE_TOOLS[0].to}>
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: VOICE_TOOLS[0].bg, border: `1px solid ${VOICE_TOOLS[0].border}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${VOICE_TOOLS[0].color}22` }}>
                {(() => { const I = VOICE_TOOLS[0].icon; return <I size={20} style={{ color: VOICE_TOOLS[0].color }} strokeWidth={1.75} />; })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm leading-tight">{VOICE_TOOLS[0].title}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{VOICE_TOOLS[0].desc}</p>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </div>
          </Link>
        </motion.div>
        {/* 2×2 mini grid */}
        <div className="grid grid-cols-2 gap-2">
          {VOICE_TOOLS.slice(1).map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Novo Tutor Intelligence ─────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          Novo AI Tutor
        </p>
        <div className="flex flex-col gap-2.5">
          {TUTOR_TOOLS.map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}>
              <Link to={to}>
                <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}22` }}>
                    <Icon size={20} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm leading-tight">{title}</p>
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5">{desc}</p>
                  </div>
                  <span className="text-muted-foreground text-sm">›</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Personalised Learning Paths ────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          Learning Paths
        </p>
        {/* Featured large card */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to={LEARNING_PATH_TOOLS[0].to}>
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: LEARNING_PATH_TOOLS[0].bg, border: `1px solid ${LEARNING_PATH_TOOLS[0].border}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${LEARNING_PATH_TOOLS[0].color}22` }}>
                {(() => { const I = LEARNING_PATH_TOOLS[0].icon; return <I size={20} style={{ color: LEARNING_PATH_TOOLS[0].color }} strokeWidth={1.75} />; })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm leading-tight">{LEARNING_PATH_TOOLS[0].title}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{LEARNING_PATH_TOOLS[0].desc}</p>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </div>
          </Link>
        </motion.div>
        {/* 3-column mini grid */}
        <div className="grid grid-cols-3 gap-2">
          {LEARNING_PATH_TOOLS.slice(1).map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Featured tool */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Link to={tools[0].to}>
          <div className="rounded-3xl p-5 overflow-hidden relative"
            style={{ background: tools[0].bg, border: `1px solid ${tools[0].border}` }}>
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full blur-3xl"
              style={{ background: `${tools[0].color}40` }} />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: `${tools[0].color}25` }}>
                  {(() => { const FeaturedIcon = tools[0].icon; return <FeaturedIcon size={24} style={{ color: tools[0].color }} strokeWidth={1.75} />; })()}
                </div>
                <h3 className="font-heading font-bold text-foreground text-lg">{tools[0].title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{tools[0].desc}</p>
              </div>
              <div className="glass px-3 py-1.5 rounded-xl">
                <span className="text-xs font-semibold text-foreground">Start →</span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3">
        {tools.slice(1).map(({ title, desc, icon: Icon, to, color, bg, border }, i) => (
          <motion.div key={to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.05 }}>
            <Link to={to}>
              <div className="rounded-3xl p-4 h-full flex flex-col gap-2 active:scale-95 transition-all"
                style={{ background: bg, border: `1px solid ${border}` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${color}20` }}>
                  <Icon size={20} style={{ color }} strokeWidth={1.75} />
                </div>
                <p className="font-semibold text-foreground text-sm leading-tight">{title}</p>
                <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
      <div className="h-4" />
    </div>
  );
}
