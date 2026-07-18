import {useState, useEffect} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ArrowLeft, CheckCircle2, Circle, Loader2, Moon, Utensils, Brain, Clock, Target, Ban} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

// ── Countdown timer hook ──────────────────────────────────────────────────────

function useCountdown(targetDate: Date | null) {
  const [remaining, setRemaining] = useState({ h: 0, m: 0, s: 0, total: 0 });

  useEffect(() => {
    if (!targetDate) return;
    function tick() {
      if (!targetDate) return;
      const diff = Math.max(0, targetDate.getTime() - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining({ h, m, s, total: diff });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return remaining;
}

// ── Last-minute checklist item ────────────────────────────────────────────────

interface CheckItem {
  id: string;
  text: string;
  category: 'logistics' | 'revision' | 'mindset';
  done: boolean;
}

const STATIC_CHECKLIST: CheckItem[] = [
  { id: 'admit', text: 'Admit card printed + digital backup', category: 'logistics', done: false },
  { id: 'id',    text: 'Photo ID (Aadhar/PAN) ready', category: 'logistics', done: false },
  { id: 'kit',   text: 'Stationery: 2 blue pens, pencil, eraser, sharpener', category: 'logistics', done: false },
  { id: 'route', text: 'Centre address + route confirmed (no surprises tomorrow)', category: 'logistics', done: false },
  { id: 'alarm', text: 'Alarm set — arrive 30 min before reporting time', category: 'logistics', done: false },
  { id: 'sleep', text: 'Sleep by 10 PM — no late-night cramming tonight', category: 'mindset', done: false },
  { id: 'food',  text: 'Light breakfast ready (avoid heavy/oily food)', category: 'mindset', done: false },
  { id: 'phone', text: 'Phone on silent + do not disturb from exam start', category: 'mindset', done: false },
];

const CATEGORY_COLORS = {
  logistics: '#5B6AF5',
  revision:  '#10B981',
  mindset:   '#F59E0B' };

// ── Rapid-fire revision topics ────────────────────────────────────────────────

interface RevisionTopic {
  subject: string;
  topic: string;
  tip: string;
  priority: 'critical' | 'high' | 'medium';
}

export default function ExamWarRoomPage() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const examDate = profile?.exam_date ? new Date(profile.exam_date) : null;
  const examName = profile?.exam_name ?? 'Your Exam';
  const countdown = useCountdown(examDate);

  const [checklist, setChecklist] = useState<CheckItem[]>(() => {
    const saved = localStorage.getItem(`edora_war_room_${user?.id}_checklist`);
    if (saved) {
      try {
        const savedDone = JSON.parse(saved) as string[];
        return STATIC_CHECKLIST.map(item => ({ ...item, done: savedDone.includes(item.id) }));
      } catch { /* fallback */ }
    }
    return STATIC_CHECKLIST;
  });

  const [topics, setTopics] = useState<RevisionTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'checklist' | 'revision' | 'mindset'>('checklist');
  const [focusMode, setFocusMode] = useState(false);

  // Persist checklist state
  useEffect(() => {
    if (!user) return;
    const doneIds = checklist.filter(i => i.done).map(i => i.id);
    localStorage.setItem(`edora_war_room_${user.id}_checklist`, JSON.stringify(doneIds));
  }, [checklist, user]);

  // Load AI-generated last-minute revision topics
  useEffect(() => {
    if (!user || topics.length > 0) return;
    (async () => {
      setTopicsLoading(true);
      try {
        // Get weak topics from DB
        const { data: stats } = await supabase
          .from('topic_stats')
          .select('subject, topic, struggle_count, win_count')
          .eq('user_id', user.id)
          .order('struggle_count', { ascending: false })
          .limit(10);

        const weakTopics = (stats ?? [])
          .map((s: { subject: string; topic: string; struggle_count: number; win_count: number }) =>
            `${s.subject}: ${s.topic} (${s.struggle_count} struggles, ${s.win_count} wins)`)
          .join('\n');

        const result = await geminiJSON<{ topics: RevisionTopic[] }>(`
You are helping a student prepare for ${examName} in the next 48 hours.
Their weak areas: ${weakTopics || 'No data yet — give general high-yield topics for JEE/NEET'}

Generate 6 last-minute revision topics with quick tips. Format as JSON:
{ "topics": [{ "subject": "Physics", "topic": "...", "tip": "1 concise revision tip (≤60 chars)", "priority": "critical"|"high"|"medium" }] }
Focus on high-yield, last-minute-revisable concepts. No derivations.`);

        setTopics(result.topics ?? []);
      } catch {
        setTopics([
          { subject: 'Physics', topic: 'Dimensional Analysis', tip: 'Check units before every formula', priority: 'critical' },
          { subject: 'Chemistry', topic: 'Organic Reactions', tip: 'Mechanism > memorization', priority: 'high' },
          { subject: 'Maths', topic: 'Integration by Parts', tip: 'ILATE rule for ordering', priority: 'high' },
          { subject: 'Physics', topic: 'Error Analysis', tip: 'Percentage error = sum of relative errors', priority: 'medium' },
          { subject: 'Chemistry', topic: 'Electrochemistry EMF', tip: 'Nernst equation at 25°C: 0.0592/n', priority: 'critical' },
          { subject: 'Maths', topic: 'Probability', tip: 'P(A∩B) = P(A)P(B|A) — start here', priority: 'medium' },
        ]);
      } finally {
        setTopicsLoading(false);
      }
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const doneCount = checklist.filter(i => i.done).length;
  const readyPct  = Math.round((doneCount / checklist.length) * 100);

  const urgencyColor = countdown.total < 6 * 3600000
    ? '#EF4444' : countdown.total < 24 * 3600000
    ? '#F59E0B' : '#5B6AF5';

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <Link aria-label="Go back" to="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={18} className="text-white" strokeWidth={1.75} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚔️</span>
              <h1 className="font-heading font-extrabold text-white text-lg">Exam War Room</h1>
            </div>
            <p className="text-xs font-medium" style={{ color: urgencyColor }}>{examName}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => setFocusMode(v => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{
              background: focusMode ? 'rgba(239,68,68,0.15)' : 'var(--ink-060)',
              border: `1px solid ${focusMode ? 'rgba(239,68,68,0.4)' : 'var(--ink-100)'}`,
              color: focusMode ? '#F87171' : 'var(--ink-600)' }}>
            Focus
          </motion.button>
        </div>

        {/* Countdown */}
        <motion.div
          animate={{ boxShadow: [`0 0 20px ${urgencyColor}33`, `0 0 40px ${urgencyColor}55`, `0 0 20px ${urgencyColor}33`] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="rounded-3xl p-5 mb-1"
          style={{
            background: `linear-gradient(135deg, ${urgencyColor}22, ${urgencyColor}11)`,
            border: `1px solid ${urgencyColor}44` }}>
          <p className="text-center text-xs font-bold mb-3" style={{ color: urgencyColor, letterSpacing: 2 }}>
            T-MINUS
          </p>
          <div className="flex justify-center items-center gap-4">
            {[
              { value: String(countdown.h).padStart(2, '0'), label: 'HRS' },
              { value: ':', label: '' },
              { value: String(countdown.m).padStart(2, '0'), label: 'MIN' },
              { value: ':', label: '' },
              { value: String(countdown.s).padStart(2, '0'), label: 'SEC' },
            ].map((item, i) => (
              item.label === '' ? (
                <span key={i} className="text-4xl font-black mb-4" style={{ color: urgencyColor }}>:</span>
              ) : (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-5xl font-black tabular-nums" style={{ color: urgencyColor, fontVariantNumeric: 'tabular-nums' }}>
                    {item.value}
                  </span>
                  <span className="text-xs font-bold tracking-widest mt-1" style={{ color: `${urgencyColor}88` }}>
                    {item.label}
                  </span>
                </div>
              )
            ))}
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="px-4 mb-3 shrink-0">
        <div className="flex gap-2 p-1 rounded-2xl" style={{ background: 'var(--ink-040)' }}>
          {(['checklist', 'revision', 'mindset'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all"
              style={{
                background: activeTab === tab ? 'var(--ink-100)' : 'transparent',
                color: activeTab === tab ? 'white' : 'var(--ink-400)' }}>
              {tab === 'checklist' ? 'Checklist' : tab === 'revision' ? 'Revision' : 'Mindset'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 native-scroll px-4 pb-nav">
        <AnimatePresence mode="wait">

          {/* Checklist Tab */}
          {activeTab === 'checklist' && (
            <motion.div key="checklist" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              {/* Progress */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white/50">{doneCount}/{checklist.length} items ready</span>
                <span className="text-xs font-bold" style={{ color: readyPct === 100 ? '#10B981' : urgencyColor }}>
                  {readyPct === 100 ? 'All ready' : `${readyPct}% ready`}
                </span>
              </div>
              <div className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--ink-080)' }}>
                <motion.div
                  animate={{ width: `${readyPct}%` }}
                  className="h-full rounded-full"
                  style={{ background: readyPct === 100 ? '#10B981' : urgencyColor }}
                />
              </div>

              <div className="flex flex-col gap-2">
                {checklist.map(item => (
                  <motion.button
                    key={item.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, done: !i.done } : i))}
                    className="flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
                    style={{
                      background: item.done ? 'rgba(16,185,129,0.1)' : 'var(--ink-040)',
                      border: `1px solid ${item.done ? 'rgba(16,185,129,0.3)' : 'var(--ink-070)'}` }}>
                    {item.done
                      ? <CheckCircle2 size={20} color="#10B981" strokeWidth={2} />
                      : <Circle size={20} color="var(--ink-250)" strokeWidth={1.75} />
                    }
                    <span className="flex-1 text-sm leading-snug" style={{ color: item.done ? 'var(--ink-500)' : 'var(--ink-850)', textDecoration: item.done ? 'line-through' : 'none' }}>
                      {item.text}
                    </span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[item.category] }} />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Revision Tab */}
          {activeTab === 'revision' && (
            <motion.div key="revision" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              {topicsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={28} className="text-primary animate-spin" />
                  <p className="text-white/50 text-sm">Analysing your weak spots…</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-white/40 mb-1">Based on your struggle history — highest priority first.</p>
                  {topics.map((topic, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="p-4 rounded-2xl"
                      style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                            style={{ background: 'rgba(91,106,245,0.15)', color: '#A0AEFF' }}>
                            {topic.subject}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                            style={{
                              background: topic.priority === 'critical' ? 'rgba(239,68,68,0.15)' : topic.priority === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                              color: topic.priority === 'critical' ? '#F87171' : topic.priority === 'high' ? '#FCD34D' : '#6EE7B7' }}>
                            {topic.priority}
                          </span>
                        </div>
                        <button
                          onClick={() => navigate(`/chat?q=${encodeURIComponent(`Quick revision: ${topic.topic}`)}`)}
                          className="text-xs font-bold px-2.5 py-1 rounded-xl active:scale-95"
                          style={{ background: 'rgba(91,106,245,0.15)', color: '#A0AEFF' }}>
                          Revise →
                        </button>
                      </div>
                      <p className="text-white font-bold text-sm mb-1">{topic.topic}</p>
                      <p className="text-white/50 text-xs leading-relaxed">{topic.tip}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Mindset Tab */}
          {activeTab === 'mindset' && (
            <motion.div key="mindset" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <div className="flex flex-col gap-3">
                {[
                  { icon: Moon, title: 'Sleep is revision', body: 'Your brain consolidates today\'s learning during sleep. 7-8 hours tonight is worth more than any last-minute cramming.' },
                  { icon: Utensils, title: 'Fuel smart', body: 'Light meal tonight and breakfast. Avoid heavy/oily food. No caffeine after 6 PM — it disrupts sleep.' },
                  { icon: Brain, title: 'Trust your preparation', body: 'You\'ve put in the work. The exam tests what you know — not what you could have known. Go in confident.' },
                  { icon: Clock, title: 'Time management in hall', body: 'Attempt sure questions first. Don\'t spend >3 min on any question. Flag and return — never leave marks on the table.' },
                  { icon: Target, title: 'Accuracy over speed', body: 'One wrong answer costs you 1 mark. One right answer earns you 4. Pick your battles wisely.' },
                  { icon: Ban, title: 'Digital detox tonight', body: 'Stop social media at 9 PM. No doom-scrolling rank prediction posts. Your preparation is done — protect your headspace.' },
                ].map((card, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="p-4 rounded-2xl flex gap-4"
                    style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
                    <card.icon size={26} className="shrink-0" style={{ color: '#A0AEFF' }} strokeWidth={1.6} />
                    <div>
                      <p className="text-white font-bold text-sm mb-1">{card.title}</p>
                      <p className="text-white/50 text-xs leading-relaxed">{card.body}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
