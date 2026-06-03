import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, GraduationCap, BookOpen, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const levels = [
  { value: 'school',   label: 'School',      sub: 'Class 6–12', icon: BookOpen },
  { value: 'college',  label: 'College',     sub: 'UG / PG',    icon: GraduationCap },
  { value: 'jee_neet', label: 'JEE / NEET',  sub: 'Entrance',   icon: Target },
  { value: 'sat_act',  label: 'SAT / ACT',   sub: 'Global',     icon: Sparkles },
];

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [studyLevel, setStudyLevel] = useState('');
  const [saving, setSaving] = useState(false);

  async function finish() {
    if (!user || !name.trim() || !studyLevel) return;
    setSaving(true);
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: name.trim(),
      study_level: studyLevel,
      xp: 0,
      level: 0,
      streak_count: 0,
      streak_freeze_count: 2,
      preferred_language: 'en',
    });
    navigate('/home', { replace: true });
  }

  const steps = [
    // Step 0: Welcome
    <motion.div key="welcome" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6 text-center">
      <div className="w-24 h-24 rounded-4xl flex items-center justify-center nova-glow"
        style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
        <Sparkles size={44} className="text-white" />
      </div>
      <div>
        <h1 className="font-heading text-4xl font-bold gradient-text">Welcome to EDORA</h1>
        <p className="text-muted-foreground mt-3 text-base leading-relaxed">
          Your AI-powered study companion. Nova AI will guide you through every topic.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full text-left">
        {['Nova AI Tutor in Teacher & Friend mode', 'Gamified streaks, XP & leaderboards', 'Smart flashcards with spaced repetition', '10-minute Study Sprints'].map(f => (
          <div key={f} className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span className="text-sm text-foreground">{f}</span>
          </div>
        ))}
      </div>
      <Button size="lg" onClick={() => setStep(1)} className="w-full">Get Started</Button>
    </motion.div>,

    // Step 1: Name
    <motion.div key="name" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
      className="flex flex-col gap-6">
      <div>
        <p className="text-primary text-sm font-semibold">Step 1 of 2</p>
        <h2 className="font-heading text-2xl font-bold text-foreground mt-1">What's your name?</h2>
        <p className="text-muted-foreground text-sm mt-1">Nova will call you by this name</p>
      </div>
      <input type="text" placeholder="Your first name" value={name} onChange={e => setName(e.target.value)}
        autoFocus
        className="glass rounded-2xl px-4 h-14 bg-transparent text-foreground placeholder:text-muted-foreground text-lg outline-none w-full"
        style={{ WebkitUserSelect: 'text', userSelect: 'text' }} />
      <Button size="lg" onClick={() => setStep(2)} disabled={!name.trim()} className="w-full">Continue</Button>
    </motion.div>,

    // Step 2: Level
    <motion.div key="level" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
      className="flex flex-col gap-6">
      <div>
        <p className="text-primary text-sm font-semibold">Step 2 of 2</p>
        <h2 className="font-heading text-2xl font-bold text-foreground mt-1">Study Level</h2>
        <p className="text-muted-foreground text-sm mt-1">We'll personalise your experience</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {levels.map(({ value, label, sub, icon: Icon }) => (
          <button key={value} onClick={() => setStudyLevel(value)}
            className={`p-4 rounded-3xl flex flex-col items-center gap-2 transition-all border
              ${studyLevel === value ? 'border-primary/60' : 'glass border-transparent'}`}
            style={studyLevel === value ? { background: 'rgba(124,58,237,0.15)' } : {}}>
            <Icon size={28} className={studyLevel === value ? 'text-primary' : 'text-muted-foreground'} strokeWidth={1.75} />
            <p className={`font-semibold text-sm ${studyLevel === value ? 'text-primary' : 'text-foreground'}`}>{label}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </button>
        ))}
      </div>
      <Button size="lg" onClick={finish} disabled={!studyLevel || saving} className="w-full">
        {saving ? 'Setting up…' : "Let's Study! 🚀"}
      </Button>
    </motion.div>,
  ];

  return (
    <div className="flex flex-col h-screen bg-background px-6" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-nova-purple/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-nova-blue/15 blur-3xl" />
      </div>
      <div className="flex-1 flex flex-col justify-center relative z-10">
        <AnimatePresence mode="wait">{steps[step]}</AnimatePresence>
      </div>
    </div>
  );
}
