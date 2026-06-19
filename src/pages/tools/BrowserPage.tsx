import { motion } from 'framer-motion';
import { Globe, ChevronLeft, ExternalLink, BookOpen, Video, FlaskConical, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { LucideIcon } from 'lucide-react';

const RESOURCES: { category: string; color: string; Icon: LucideIcon; items: { name: string; desc: string; url: string }[] }[] = [
  {
    category: 'Reference',
    color: '#818CF8',
    Icon: BookOpen,
    items: [
      { name: 'Wikipedia',      desc: 'Encyclopedia for any topic',     url: 'https://en.wikipedia.org' },
      { name: 'Wolfram Alpha',  desc: 'Computational knowledge engine', url: 'https://www.wolframalpha.com' },
      { name: 'Britannica',     desc: 'Trusted encyclopedia',           url: 'https://www.britannica.com' },
    ],
  },
  {
    category: 'Video Lessons',
    color: '#F472B6',
    Icon: Video,
    items: [
      { name: 'Khan Academy',   desc: 'Free lessons on every subject',  url: 'https://www.khanacademy.org' },
      { name: '3Blue1Brown',    desc: 'Visual math explanations',       url: 'https://www.3blue1brown.com' },
      { name: 'CrashCourse',   desc: 'Fun educational videos',          url: 'https://thecrashcourse.com'  },
    ],
  },
  {
    category: 'Practice',
    color: '#34D399',
    Icon: FlaskConical,
    items: [
      { name: 'Brilliant',        desc: 'Interactive STEM problems', url: 'https://brilliant.org'       },
      { name: 'Desmos',           desc: 'Graphing calculator',       url: 'https://www.desmos.com'      },
      { name: 'PhET Simulations', desc: 'Science lab simulations',   url: 'https://phet.colorado.edu'   },
    ],
  },
  {
    category: 'Indian Exams',
    color: '#FBBF24',
    Icon: GraduationCap,
    items: [
      { name: 'NCERT Books',        desc: 'Official NCERT textbooks',  url: 'https://ncert.nic.in/textbook.php' },
      { name: 'PW (PhysicsWallah)', desc: 'JEE/NEET prep videos',      url: 'https://www.pw.live'               },
      { name: 'Unacademy',          desc: 'Live + recorded classes',    url: 'https://unacademy.com'             },
    ],
  },
];

async function openUrl(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function BrowserPage() {
  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <Link aria-label="Go back" to="/tools"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)' }}>
          <Globe size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Research Browser</h2>
          <p className="text-xs text-muted-foreground">Curated educational resources</p>
        </div>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-5">
        {RESOURCES.map(({ category, color, Icon, items }, ci) => (
          <motion.div key={category}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.06 }}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={12} style={{ color }} />
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{category}</p>
            </div>
            <div className="flex flex-col gap-2">
              {items.map(({ name, desc, url }) => (
                <button key={name} onClick={() => openUrl(url)}
                  className="rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left active:scale-98 transition-all w-full"
                  style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}18` }}>
                    <Globe size={16} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
                  </div>
                  <ExternalLink size={14} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        ))}
        <div className="h-4" />
      </div>
    </div>
  );
}
