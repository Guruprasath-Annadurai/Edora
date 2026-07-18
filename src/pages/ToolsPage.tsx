import { motion } from 'framer-motion';
import { Globe, FileText, ScanLine, BookMarked, PenLine, Clock, FileScan, Brain, Map, AlertTriangle, GraduationCap, Layers, Sparkles, Network, Mic, PenTool, Camera, BookText, Youtube, Zap, Swords, Trophy, BookOpen, Flame, TrendingUp, Activity, BarChart2, FileOutput, Users, Radar, BookCopy, History, Play, TestTube2, Sword, Rss, BarChart, UserPlus, Handshake, PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useT } from '@/hooks/useT';
import type { UIStringKey } from '@/lib/i18n/uiStrings';

interface ToolCard { titleKey: UIStringKey; descKey: UIStringKey; icon: typeof FileScan; to: string; color: string; bg: string; border: string; large?: boolean; }

const tools: ToolCard[] = [
  { titleKey: 'tools.pdf_pack.title', descKey: 'tools.pdf_pack.desc', icon: FileScan, to: '/study-pack', color: '#F59E0B',
    bg: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(239,68,68,0.18))', border: 'rgba(245,158,11,0.35)', large: true },
  { titleKey: 'tools.exam_sim.title', descKey: 'tools.exam_sim.desc', icon: Clock, to: '/exam-simulator', color: '#7C3AED',
    bg: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(59,130,246,0.2))', border: 'rgba(124,58,237,0.3)', large: true },
  { titleKey: 'tools.notes_scanner.title', descKey: 'tools.notes_scanner.desc', icon: ScanLine, to: '/scanner', color: '#06B6D4',
    bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.2)', large: false },
  { titleKey: 'tools.mistake_journal.title', descKey: 'tools.mistake_journal.desc', icon: PenLine, to: '/journal', color: '#EC4899',
    bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.2)', large: false },
  { titleKey: 'tools.study_notes.title', descKey: 'tools.study_notes.desc', icon: FileText, to: '/notes', color: '#10B981',
    bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.2)', large: false },
  { titleKey: 'tools.mnemonic.title', descKey: 'tools.mnemonic.desc', icon: BookMarked, to: '/mnemonics', color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.2)', large: false },
  { titleKey: 'tools.browser.title', descKey: 'tools.browser.desc', icon: Globe, to: '/browser', color: '#3B82F6',
    bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.2)', large: false },
];

const TUTOR_TOOLS: ToolCard[] = [
  { titleKey: 'tools.novo_tutoring.title', descKey: 'tools.novo_tutoring.desc', icon: Brain, to: '/tutoring', color: '#5B6AF5',
    bg: 'linear-gradient(135deg, rgba(91,106,245,0.18), rgba(139,92,246,0.18))', border: 'rgba(91,106,245,0.35)' },
  { titleKey: 'tools.concept_map.title', descKey: 'tools.concept_map.desc', icon: Map, to: '/concept-map', color: '#06B6D4',
    bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.25)' },
  { titleKey: 'tools.error_patterns.title', descKey: 'tools.error_patterns.desc', icon: AlertTriangle, to: '/error-patterns', color: '#F97316',
    bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)' },
];

const VOICE_TOOLS: ToolCard[] = [
  { titleKey: 'tools.novo_live.title', descKey: 'tools.novo_live.desc', icon: Mic, to: '/novo-live', color: '#EF4444',
    bg: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(245,158,11,0.18))', border: 'rgba(239,68,68,0.35)', large: true },
  { titleKey: 'tools.whiteboard.title', descKey: 'tools.whiteboard.desc', icon: PenTool, to: '/whiteboard', color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)' },
  { titleKey: 'tools.photo_solver.title', descKey: 'tools.photo_solver.desc', icon: Camera, to: '/photo-solver', color: '#06B6D4',
    bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.25)' },
  { titleKey: 'tools.novo_reads.title', descKey: 'tools.novo_reads.desc', icon: BookText, to: '/novo-reads', color: '#10B981',
    bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
  { titleKey: 'tools.video_companion.title', descKey: 'tools.video_companion.desc', icon: Youtube, to: '/video-companion', color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
];

const LEARNING_PATH_TOOLS: ToolCard[] = [
  { titleKey: 'tools.curricula.title', descKey: 'tools.curricula.desc', icon: GraduationCap, to: '/curriculum', color: '#10B981',
    bg: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.18))', border: 'rgba(16,185,129,0.35)', large: true },
  { titleKey: 'tools.spaced_review.title', descKey: 'tools.spaced_review.desc', icon: Layers, to: '/spaced-review', color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)' },
  { titleKey: 'tools.learning_style.title', descKey: 'tools.learning_style.desc', icon: Sparkles, to: '/learning-style', color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
  { titleKey: 'tools.subject_map.title', descKey: 'tools.subject_map.desc', icon: Network, to: '/subject-map', color: '#EC4899',
    bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.25)' },
];

export default function ToolsPage() {
  const t = useT();
  return (
    <div className="h-full native-scroll px-4 pt-5 pb-nav flex flex-col gap-5" style={{ background: 'transparent' }}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', boxShadow: '0 4px 16px rgba(236,72,153,0.3)' }}>
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">{t('tools.eyebrow')}</p>
          <h1 className="font-heading text-2xl font-extrabold text-foreground leading-tight">{t('tools.title')}</h1>
        </div>
      </div>

      {/* ── Analytics & Reporting ─────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          {t('tools.section.analytics')}
        </p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to="/exam-prediction">
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(16,185,129,0.15)' }}>
                <TrendingUp size={20} style={{ color: '#34D399' }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm leading-tight">{t('tools.exam_predictor.title')}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t('tools.exam_predictor.desc')}</p>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {([
            { titleKey: 'tools.weakness_radar.title', descKey: 'tools.weakness_radar.desc', icon: Radar, to: '/weakness-radar', color: '#A78BFA', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { titleKey: 'tools.attention_heatmap.title', descKey: 'tools.attention_heatmap.desc', icon: Activity, to: '/attention-heatmap', color: '#F87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
            { titleKey: 'tools.confidence_score.title', descKey: 'tools.confidence_score.desc', icon: BarChart2, to: '/confidence', color: '#38BDF8', bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.25)' },
          ] as ToolCard[]).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            { titleKey: 'tools.parent_report.title', descKey: 'tools.parent_report.desc', icon: Users, to: '/parent', color: '#C4B5FD', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { titleKey: 'tools.teacher_export.title', descKey: 'tools.teacher_export.desc', icon: FileOutput, to: '/teacher-export', color: '#FBBF24', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
          ] as ToolCard[]).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 2) * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Exam Prep ─────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          {t('tools.section.exam_prep')}
        </p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to="/mock-test">
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(96,165,250,0.15)' }}>
                <TestTube2 size={20} style={{ color: '#60A5FA' }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm leading-tight">{t('tools.mock_test.title')}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t('tools.mock_test.desc')}</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.2)', color: '#60A5FA' }}>{t('tools.badge.new')}</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {([
            { titleKey: 'tools.pyq_bank.title', descKey: 'tools.pyq_bank.desc', icon: History, to: '/pyq-bank', color: '#FB923C', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
            { titleKey: 'tools.ai_quiz_bank.title', descKey: 'tools.ai_quiz_bank.desc', icon: Brain, to: '/ai-quiz', color: '#A78BFA', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { titleKey: 'tools.upsc_mains.title', descKey: 'tools.upsc_mains.desc', icon: PenLine, to: '/upsc-mains', color: '#818CF8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.25)' },
          ] as ToolCard[]).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            { titleKey: 'tools.ncert_chapters.title', descKey: 'tools.ncert_chapters.desc', icon: BookCopy, to: '/ncert-chapters', color: '#34D399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)' },
            { titleKey: 'tools.concept_videos.title', descKey: 'tools.concept_videos.desc', icon: Play, to: '/concept-videos', color: '#F472B6', bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.25)' },
          ] as ToolCard[]).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 2) * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Competitive & Social ──────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          {t('tools.section.competitive')}
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
                <p className="font-semibold text-white text-sm leading-tight">{t('tools.leaderboard.title')}</p>
                <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--ink-450)' }}>{t('tools.leaderboard.desc')}</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.2)', color: '#60A5FA' }}>{t('tools.badge.live')}</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {([
            { titleKey: 'tools.battle_1v1.title', descKey: 'tools.battle_1v1.desc', icon: Sword, to: '/battle', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
            { titleKey: 'tools.study_circles.title', descKey: 'tools.study_circles.desc', icon: Users, to: '/circles', color: '#34D399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)' },
            { titleKey: 'tools.achievement_feed.title', descKey: 'tools.achievement_feed.desc', icon: Rss, to: '/feed', color: '#F472B6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.25)' },
            { titleKey: 'tools.friends.title', descKey: 'tools.friends.desc', icon: UserPlus, to: '/friends', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.25)' },
            { titleKey: 'tools.study_buddy.title', descKey: 'tools.study_buddy.desc', icon: Handshake, to: '/study-buddy', color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)' },
            { titleKey: 'tools.live_events.title', descKey: 'tools.live_events.desc', icon: PartyPopper, to: '/live-event', color: '#FBBF24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)' },
          ] as ToolCard[]).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Gamified & Social ──────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          {t('tools.section.gamified')}
        </p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5">
          <Link to="/challenges">
            <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <Zap size={20} style={{ color: '#FBBF24' }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm leading-tight">{t('tools.boss_challenge.title')}</p>
                <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--ink-450)' }}>{t('tools.boss_challenge.desc')}</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.2)', color: '#FBBF24' }}>{t('tools.badge.double_xp')}</span>
            </div>
          </Link>
        </motion.div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {([
            { titleKey: 'tools.tournament.title', descKey: 'tools.tournament.desc', icon: Trophy, to: '/tournament', color: '#C4B5FD', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
            { titleKey: 'tools.debate.title', descKey: 'tools.debate.desc', icon: Swords, to: '/debate', color: '#F87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
          ] as ToolCard[]).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            { titleKey: 'tools.story_mode.title', descKey: 'tools.story_mode.desc', icon: BookOpen, to: '/story-mode', color: '#34D399', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
            { titleKey: 'tools.streak_challenges.title', descKey: 'tools.streak_challenges.desc', icon: Flame, to: '/streaks', color: '#FB923C', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
          ] as ToolCard[]).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 2) * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Voice & Multimodal ──────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          {t('tools.section.voice')}
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
                <p className="font-semibold text-foreground text-sm leading-tight">{t(VOICE_TOOLS[0].titleKey)}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t(VOICE_TOOLS[0].descKey)}</p>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </div>
          </Link>
        </motion.div>
        {/* 2×2 mini grid */}
        <div className="grid grid-cols-2 gap-2">
          {VOICE_TOOLS.slice(1).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Novo Tutor Intelligence ─────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
          {t('tools.section.novo_tutor')}
        </p>
        <div className="flex flex-col gap-2.5">
          {TUTOR_TOOLS.map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
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
                    <p className="font-semibold text-foreground text-sm leading-tight">{t(titleKey)}</p>
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t(descKey)}</p>
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
          {t('tools.section.learning_paths')}
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
                <p className="font-semibold text-foreground text-sm leading-tight">{t(LEARNING_PATH_TOOLS[0].titleKey)}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t(LEARNING_PATH_TOOLS[0].descKey)}</p>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </div>
          </Link>
        </motion.div>
        {/* 3-column mini grid */}
        <div className="grid grid-cols-3 gap-2">
          {LEARNING_PATH_TOOLS.slice(1).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}>
              <Link to={to}>
                <div className="rounded-2xl p-3 h-full flex flex-col gap-1.5 active:scale-95 transition-all"
                  style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}20` }}>
                    <Icon size={16} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold text-foreground text-xs leading-tight">{t(titleKey)}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
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
                <h3 className="font-heading font-bold text-foreground text-lg">{t(tools[0].titleKey)}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{t(tools[0].descKey)}</p>
              </div>
              <div className="glass px-3 py-1.5 rounded-xl">
                <span className="text-xs font-semibold text-foreground">{t('tools.start_arrow')}</span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3">
        {tools.slice(1).map(({ titleKey, descKey, icon: Icon, to, color, bg, border }, i) => (
          <motion.div key={to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.05 }}>
            <Link to={to}>
              <div className="rounded-3xl p-4 h-full flex flex-col gap-2 active:scale-95 transition-all"
                style={{ background: bg, border: `1px solid ${border}` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${color}20` }}>
                  <Icon size={20} style={{ color }} strokeWidth={1.75} />
                </div>
                <p className="font-semibold text-foreground text-sm leading-tight">{t(titleKey)}</p>
                <p className="text-xs text-muted-foreground leading-tight">{t(descKey)}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
      <div className="h-4" />
    </div>
  );
}
