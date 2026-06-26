export interface SubjectTheme {
  accent: string;        // primary hex color
  accentRgb: string;     // "r,g,b" for rgba()
  chip: string;          // CSS class from globals
  glow: string;          // CSS class from globals
  bg: string;            // rgba background for tinted surfaces
  border: string;        // rgba border for tinted surfaces
  text: string;          // text color on dark bg
}

const SUBJECT_THEMES: Record<string, SubjectTheme> = {
  mathematics: {
    accent: '#60A5FA', accentRgb: '59,130,246',
    chip: 'chip-math', glow: 'subject-glow-math',
    bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.28)', text: '#93C5FD',
  },
  physics: {
    accent: '#A78BFA', accentRgb: '124,58,237',
    chip: 'chip-physics', glow: 'subject-glow-physics',
    bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.28)', text: '#C4B5FD',
  },
  chemistry: {
    accent: '#34D399', accentRgb: '16,185,129',
    chip: 'chip-chem', glow: 'subject-glow-chem',
    bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.28)', text: '#6EE7B7',
  },
  biology: {
    accent: '#4ADE80', accentRgb: '34,197,94',
    chip: 'chip-biology', glow: '',
    bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.28)', text: '#86EFAC',
  },
  english: {
    accent: '#FB923C', accentRgb: '249,115,22',
    chip: 'chip-english', glow: '',
    bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.28)', text: '#FCA5A5',
  },
  history: {
    accent: '#FBBF24', accentRgb: '251,191,36',
    chip: 'chip-history', glow: '',
    bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.28)', text: '#FDE68A',
  },
  economics: {
    accent: '#22D3EE', accentRgb: '6,182,212',
    chip: 'chip-econ', glow: '',
    bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.28)', text: '#A5F3FC',
  },
  'computer science': {
    accent: '#A855F7', accentRgb: '139,92,246',
    chip: 'chip-cs', glow: '',
    bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.28)', text: '#DDD6FE',
  },
};

const DEFAULT_THEME: SubjectTheme = {
  accent: '#818CF8', accentRgb: '91,106,245',
  chip: '', glow: '',
  bg: 'rgba(91,106,245,0.12)', border: 'rgba(91,106,245,0.28)', text: '#A0AEFF',
};

export function getSubjectTheme(subject: string): SubjectTheme {
  return SUBJECT_THEMES[subject.toLowerCase()] ?? DEFAULT_THEME;
}
