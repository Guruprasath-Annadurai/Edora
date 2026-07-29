export interface SubjectTheme {
  accent: string;        // primary hex color — theme-adjusted for text-on-tint use
  accentRgb: string;     // "r,g,b" for rgba()
  chip: string;          // CSS class from globals
  glow: string;          // CSS class from globals
  bg: string;            // rgba background for tinted surfaces
  border: string;        // rgba border for tinted surfaces
  text: string;          // text color on dark bg
}

interface SubjectThemeDef {
  accent: string;
  accentLight: string;  // darker same-hue variant — WCAG AA (4.5:1+) on a light-theme tinted surface
  accentRgb: string;
  chip: string;
  glow: string;
  bg: string;
  border: string;
  text: string;
}

const SUBJECT_THEMES: Record<string, SubjectThemeDef> = {
  mathematics: {
    accent: '#60A5FA', accentLight: '#1D4ED8', accentRgb: '59,130,246',
    chip: 'chip-math', glow: 'subject-glow-math',
    bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.28)', text: '#93C5FD',
  },
  physics: {
    accent: '#A78BFA', accentLight: '#6D28D9', accentRgb: '124,58,237',
    chip: 'chip-physics', glow: 'subject-glow-physics',
    bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.28)', text: '#C4B5FD',
  },
  chemistry: {
    accent: '#34D399', accentLight: '#065F46', accentRgb: '16,185,129',
    chip: 'chip-chem', glow: 'subject-glow-chem',
    bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.28)', text: '#6EE7B7',
  },
  biology: {
    accent: '#4ADE80', accentLight: '#14532D', accentRgb: '34,197,94',
    chip: 'chip-biology', glow: '',
    bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.28)', text: '#86EFAC',
  },
  english: {
    accent: '#FB923C', accentLight: '#9A3412', accentRgb: '249,115,22',
    chip: 'chip-english', glow: '',
    bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.28)', text: '#FCA5A5',
  },
  history: {
    accent: '#FBBF24', accentLight: '#92400E', accentRgb: '251,191,36',
    chip: 'chip-history', glow: '',
    bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.28)', text: '#FDE68A',
  },
  economics: {
    accent: '#22D3EE', accentLight: '#155E75', accentRgb: '6,182,212',
    chip: 'chip-econ', glow: '',
    bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.28)', text: '#A5F3FC',
  },
  'computer science': {
    accent: '#A855F7', accentLight: '#6D28D9', accentRgb: '139,92,246',
    chip: 'chip-cs', glow: '',
    bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.28)', text: '#DDD6FE',
  },
};

const DEFAULT_THEME: SubjectThemeDef = {
  accent: '#818CF8', accentLight: '#4338CA', accentRgb: '91,106,245',
  chip: '', glow: '',
  bg: 'rgba(91,106,245,0.12)', border: 'rgba(91,106,245,0.28)', text: '#A0AEFF',
};

// `accent` is used as text color on `bg`-tinted surfaces (e.g. "Question"/"Answer"
// chips). The pale accent hexes read fine on dark theme's near-black tinted cards
// but drop to ~1.5-3.1:1 contrast on light theme's pale tinted cards — pass
// isLight to get a darkened, WCAG AA-passing (4.2-7.3:1) same-hue variant instead.
export function getSubjectTheme(subject: string, isLight = false): SubjectTheme {
  const def = SUBJECT_THEMES[subject.toLowerCase()] ?? DEFAULT_THEME;
  return { ...def, accent: isLight ? def.accentLight : def.accent };
}
