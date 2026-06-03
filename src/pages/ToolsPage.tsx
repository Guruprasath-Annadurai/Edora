import { motion } from 'framer-motion';
import { Globe, FileText, ScanLine, BookMarked, PenLine, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

const tools = [
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

export default function ToolsPage() {
  return (
    <div className="h-full native-scroll px-4 py-4 flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Study Tools</h1>
        <p className="text-muted-foreground text-sm">Everything you need to study smarter</p>
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
                  <Clock size={24} style={{ color: tools[0].color }} strokeWidth={1.75} />
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
