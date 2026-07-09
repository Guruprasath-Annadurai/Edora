import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { storage } from '@/lib/storage';

export type AppTheme =
  | 'default'
  | 'light'
  | 'oled'
  | 'blue'
  | 'green'
  | 'red'
  | 'gold'
  | 'midnight'
  | 'sakura';

export interface ThemeMeta {
  id: AppTheme;
  label: string;
  description: string;
  pro: boolean;
  preview: [string, string]; // gradient pair for preview swatch
}

export const THEMES: ThemeMeta[] = [
  { id: 'default',  label: 'Space Purple',   description: 'Classic Edora purple',         pro: false, preview: ['#5B6AF5','#8B5CF6'] },
  { id: 'light',    label: 'Light Mode',     description: 'Clean white for bright spaces', pro: false, preview: ['#F8FAFC','#E2E8F0'] },
  { id: 'oled',     label: 'True Black',      description: 'Pure OLED black, saves battery', pro: false, preview: ['#000000','#111111'] },
  { id: 'blue',     label: 'Ocean Blue',      description: 'Deep ocean vibes',              pro: false, preview: ['#0EA5E9','#3B82F6'] },
  { id: 'green',    label: 'Forest',          description: 'Focus green',                   pro: false, preview: ['#10B981','#059669'] },
  { id: 'red',      label: 'Mars Red',        description: 'Bold and intense',              pro: false, preview: ['#EF4444','#DC2626'] },
  { id: 'gold',     label: 'Gold Rush',       description: 'Premium warm gold',             pro: false, preview: ['#EAB308','#F59E0B'] },
  { id: 'midnight', label: 'Midnight Blue',   description: 'Deep dark blue — exclusive',   pro: true,  preview: ['#1E3A5F','#0F2744'] },
  { id: 'sakura',   label: 'Sakura Pink',     description: 'Cherry blossom — exclusive',   pro: true,  preview: ['#EC4899','#F472B6'] },
];

// CSS var overrides per theme
const THEME_VARS: Record<AppTheme, Record<string, string>> = {
  light: {
    // ── v2 design system (flat corporate) — namespaced so rebuilt screens
    // can adopt incrementally without touching legacy --s1/--t1 glass tokens.
    '--v2-bg':        '#F8FAFC',
    '--v2-card':       '#FFFFFF',
    '--v2-elevated':   '#F3F4FA',
    '--v2-border':     '#E4E7EE',
    '--v2-border-2':   '#EDEEF3',
    '--v2-primary':        '#4F5FE4',
    '--v2-primary-active': '#3E52C9',
    '--v2-primary-hover':  '#455CDB',
    '--v2-primary-tint':   'rgba(79,95,228,0.06)',
    '--v2-primary-tint-2': 'rgba(79,95,228,0.10)',
    '--v2-accent2':    '#7C3AED',
    '--v2-text-1': '#0F1222',
    '--v2-text-2': '#3A4256',
    '--v2-text-3': '#545B72',
    '--v2-text-4': '#8890A6',
    '--v2-chevron': '#B8BECF',
    '--v2-success': '#10B981', '--v2-success-text': '#059669',
    '--v2-error':   '#EF4444', '--v2-error-text':   '#DC2626',
    '--v2-warning': '#F59E0B', '--v2-warning-text': '#B45309',
    '--v2-info':    '#3B82F6',
    '--background':         '210 40% 98%',
    '--card':               '0 0% 100%',
    '--foreground':         '222 47% 11%',
    '--card-foreground':    '222 47% 11%',
    '--muted':              '210 40% 93%',
    '--muted-foreground':   '215 16% 47%',
    '--border':             '214 32% 91%',
    '--input':              '214 32% 91%',
    '--primary':            '234 87% 55%',
    '--primary-foreground': '0 0% 100%',
    '--accent':             '262 83% 58%',
    '--accent-foreground':  '0 0% 100%',
    '--page-bg-start':      '#F8FAFC',
    '--page-bg-end':        '#EEF2FF',
    '--orb-primary':        'rgba(91,106,245,0.08)',
    '--orb-secondary':      'rgba(139,92,246,0.06)',
    '--primary-hex':        '#4F5FE4',
    '--accent-hex':         '#7C3AED',
    // Ink tokens — flips every rgba(255,255,255,X) surface/text/border in the app
    // to a dark-slate ink at the same alpha (see globals.css :root for the dark defaults).
    '--ink-020': 'rgba(15,23,42,0.02)',  '--ink-030': 'rgba(15,23,42,0.03)',
    '--ink-035': 'rgba(15,23,42,0.035)', '--ink-040': 'rgba(15,23,42,0.04)',
    '--ink-045': 'rgba(15,23,42,0.045)', '--ink-050': 'rgba(15,23,42,0.05)',
    '--ink-055': 'rgba(15,23,42,0.055)', '--ink-060': 'rgba(15,23,42,0.06)',
    '--ink-070': 'rgba(15,23,42,0.07)',  '--ink-080': 'rgba(15,23,42,0.08)',
    '--ink-090': 'rgba(15,23,42,0.09)',  '--ink-100': 'rgba(15,23,42,0.1)',
    '--ink-120': 'rgba(15,23,42,0.12)',  '--ink-140': 'rgba(15,23,42,0.14)',
    '--ink-150': 'rgba(15,23,42,0.15)',  '--ink-160': 'rgba(15,23,42,0.16)',
    '--ink-180': 'rgba(15,23,42,0.18)',  '--ink-200': 'rgba(15,23,42,0.2)',
    '--ink-220': 'rgba(15,23,42,0.22)',  '--ink-240': 'rgba(15,23,42,0.24)',
    '--ink-250': 'rgba(15,23,42,0.25)',  '--ink-280': 'rgba(15,23,42,0.28)',
    '--ink-300': 'rgba(15,23,42,0.30)',  '--ink-320': 'rgba(15,23,42,0.32)',
    '--ink-350': 'rgba(15,23,42,0.35)',  '--ink-360': 'rgba(15,23,42,0.36)',
    '--ink-380': 'rgba(15,23,42,0.38)',  '--ink-400': 'rgba(15,23,42,0.4)',
    '--ink-420': 'rgba(15,23,42,0.42)',  '--ink-450': 'rgba(15,23,42,0.45)',
    '--ink-500': 'rgba(15,23,42,0.5)',   '--ink-550': 'rgba(15,23,42,0.55)',
    '--ink-600': 'rgba(15,23,42,0.6)',   '--ink-650': 'rgba(15,23,42,0.65)',
    '--ink-700': 'rgba(15,23,42,0.7)',   '--ink-750': 'rgba(15,23,42,0.75)',
    '--ink-800': 'rgba(15,23,42,0.8)',   '--ink-820': 'rgba(15,23,42,0.82)',
    '--ink-850': 'rgba(15,23,42,0.85)',  '--ink-880': 'rgba(15,23,42,0.88)',
    '--ink-900': 'rgba(15,23,42,0.9)',   '--ink-920': 'rgba(15,23,42,0.92)',
    '--ink-950': 'rgba(15,23,42,0.95)',
    '--surface-elev-07':  'rgba(255,255,255,0.7)',
    '--surface-elev-08':  'rgba(255,255,255,0.8)',
    '--surface-elev-09':  'rgba(255,255,255,0.92)',
    '--surface-elev-095': 'rgba(255,255,255,0.97)',
    '--surface-nav':          'rgba(255,255,255,0.85)',
    '--surface-nav-solid':    'rgba(255,255,255,0.92)',
    '--surface-modal':        'rgba(255,255,255,0.90)',
    '--surface-nav-perf':     'rgba(255,255,255,0.97)',
    '--surface-panel-perf':   'rgba(255,255,255,0.96)',
    '--surface-glass-perf':   'rgba(255,255,255,0.93)',
    '--surface-modal-perf':   'rgba(255,255,255,0.98)',
    '--grad-purple-header-1': '#EEF2FF',
    '--grad-purple-header-2': '#E0E7FF',
    '--grad-purple-header-3': '#C7D2FE',
    '--grad-pro-header-1':    '#F5F3FF',
    '--grad-pro-header-2':    '#FFFFFF',
    '--grad-mood-card-1':     '#FFFFFF',
    '--grad-mood-card-2':     '#F8FAFC',
    '--grad-voice-overlay-1': '#F8FAFC',
    '--grad-voice-overlay-2': '#EEF2FF',
    '--grad-voice-overlay-3': '#E0E7FF',
    '--grad-permission-1': '#F8FAFC',
    '--grad-permission-2': '#EEF2FF',
    '--grad-fab-1':        '#FFFFFF',
    '--grad-fab-2':        '#F1F5F9',
    '--grad-memory-1':     '#FFFFFF',
    '--grad-memory-2':     '#F8FAFC',
    '--grad-referral-1':   '#F8FAFC',
    '--grad-referral-2':   '#EEF2FF',
    '--grad-home-hero-1':  '#F8FAFC',
    '--grad-home-hero-2':  '#EEF2FF',
    '--hdr-a-600': 'rgba(255,255,255,0.6)',
    '--hdr-a-820': 'rgba(255,255,255,0.82)',
    '--hdr-a-880': 'rgba(255,255,255,0.88)',
    '--hdr-a-900': 'rgba(255,255,255,0.90)',
    '--hdr-a-920': 'rgba(255,255,255,0.92)',
    '--hdr-a-960': 'rgba(255,255,255,0.96)',
    '--hdr-b-550': 'rgba(255,255,255,0.55)',
    '--hdr-b-750': 'rgba(255,255,255,0.75)',
    '--hdr-b-900': 'rgba(255,255,255,0.9)',
    '--hdr-b-950': 'rgba(255,255,255,0.95)',
    '--hdr-b-980': 'rgba(255,255,255,0.98)',
    '--surface-scrim': 'rgba(255,255,255,0.93)',
    '--surface-sheet':     '#FFFFFF',
    '--surface-banner-1':  '#FFFFFF',
    '--surface-banner-2':  '#EEF2FF',
    '--grad-curriculum-1': '#F8FAFC',
    '--grad-curriculum-2': '#EEF2FF',
  },
  default: {
    '--v2-bg':        '#060918',
    '--v2-card':       '#10142A',
    '--v2-elevated':   '#181C36',
    '--v2-border':     '#1E2444',
    '--v2-border-2':   '#262C50',
    '--v2-primary':        '#7C3AED',
    '--v2-primary-active': '#6D2FD9',
    '--v2-primary-hover':  '#8A4EF0',
    '--v2-primary-tint':   'rgba(124,58,237,0.14)',
    '--v2-primary-tint-2': 'rgba(124,58,237,0.20)',
    '--v2-accent2':    '#8B93F9',
    '--v2-text-1': '#F5F7FA',
    '--v2-text-2': '#C4C9DA',
    '--v2-text-3': '#A8AFC7',
    '--v2-text-4': '#6B7280',
    '--v2-chevron': '#3A4066',
    '--v2-success': '#10B981', '--v2-success-text': '#34D399',
    '--v2-error':   '#EF4444', '--v2-error-text':   '#F87171',
    '--v2-warning': '#F59E0B', '--v2-warning-text': '#FBBF24',
    '--v2-info':    '#3B82F6',
    '--background':    '226 53% 7%',
    '--card':          '228 47% 11%',
    '--primary':       '234 87% 63%',
    '--accent':        '262 83% 63%',
    '--page-bg-start': '#0A0F25',
    '--page-bg-end':   '#080C1A',
    '--orb-primary':   'rgba(139,92,246,0.18)',
    '--orb-secondary': 'rgba(91,106,245,0.18)',
    '--primary-hex':   '#5B6AF5',
    '--accent-hex':    '#8B5CF6',
  },
  oled: {
    '--background':    '0 0% 0%',
    '--card':          '0 0% 4%',
    '--primary':       '234 87% 63%',
    '--accent':        '262 83% 63%',
    '--page-bg-start': '#000000',
    '--page-bg-end':   '#000000',
    '--orb-primary':   'rgba(139,92,246,0.12)',
    '--orb-secondary': 'rgba(91,106,245,0.12)',
    '--primary-hex':   '#5B6AF5',
    '--accent-hex':    '#8B5CF6',
  },
  blue: {
    '--background':    '213 60% 6%',
    '--card':          '213 55% 10%',
    '--primary':       '199 89% 48%',
    '--accent':        '221 83% 60%',
    '--page-bg-start': '#040D1A',
    '--page-bg-end':   '#020810',
    '--orb-primary':   'rgba(14,165,233,0.18)',
    '--orb-secondary': 'rgba(59,130,246,0.18)',
    '--primary-hex':   '#0EA5E9',
    '--accent-hex':    '#3B82F6',
  },
  green: {
    '--background':    '158 50% 5%',
    '--card':          '158 45% 9%',
    '--primary':       '160 84% 39%',
    '--accent':        '142 71% 45%',
    '--page-bg-start': '#021A0D',
    '--page-bg-end':   '#011008',
    '--orb-primary':   'rgba(16,185,129,0.18)',
    '--orb-secondary': 'rgba(5,150,105,0.18)',
    '--primary-hex':   '#10B981',
    '--accent-hex':    '#059669',
  },
  red: {
    '--background':    '0 55% 6%',
    '--card':          '0 50% 10%',
    '--primary':       '0 72% 51%',
    '--accent':        '4 86% 58%',
    '--page-bg-start': '#1A0404',
    '--page-bg-end':   '#100202',
    '--orb-primary':   'rgba(239,68,68,0.18)',
    '--orb-secondary': 'rgba(220,38,38,0.18)',
    '--primary-hex':   '#EF4444',
    '--accent-hex':    '#DC2626',
  },
  gold: {
    '--background':    '43 55% 6%',
    '--card':          '43 50% 10%',
    '--primary':       '43 96% 56%',
    '--accent':        '38 92% 50%',
    '--page-bg-start': '#1A1202',
    '--page-bg-end':   '#100C01',
    '--orb-primary':   'rgba(234,179,8,0.18)',
    '--orb-secondary': 'rgba(245,158,11,0.18)',
    '--primary-hex':   '#EAB308',
    '--accent-hex':    '#F59E0B',
  },
  midnight: {
    '--background':    '215 60% 5%',
    '--card':          '215 55% 9%',
    '--primary':       '210 80% 45%',
    '--accent':        '220 75% 55%',
    '--page-bg-start': '#020D1F',
    '--page-bg-end':   '#010812',
    '--orb-primary':   'rgba(30,58,95,0.4)',
    '--orb-secondary': 'rgba(15,39,68,0.4)',
    '--primary-hex':   '#1D4ED8',
    '--accent-hex':    '#2563EB',
  },
  sakura: {
    '--background':    '330 55% 6%',
    '--card':          '330 50% 10%',
    '--primary':       '330 80% 60%',
    '--accent':        '316 73% 65%',
    '--page-bg-start': '#1A0411',
    '--page-bg-end':   '#10020A',
    '--orb-primary':   'rgba(236,72,153,0.18)',
    '--orb-secondary': 'rgba(244,114,182,0.18)',
    '--primary-hex':   '#EC4899',
    '--accent-hex':    '#F472B6',
  },
};

const STORAGE_KEY = 'edora_theme';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  isPro: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'default', setTheme: () => {}, isPro: false,
});

export function ThemeProvider({ children, isPro = false }: { children: ReactNode; isPro?: boolean }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    return (storage.getItem(STORAGE_KEY) as AppTheme) ?? 'default';
  });

  function setTheme(t: AppTheme) {
    const meta = THEMES.find(th => th.id === t);
    if (meta?.pro && !isPro) return; // guard Pro themes
    setThemeState(t);
    storage.setItem(STORAGE_KEY, t);
  }

  useEffect(() => {
    const root = document.documentElement;
    const vars = THEME_VARS[theme] ?? THEME_VARS.default;

    // Clear every custom property any theme might set before applying the new
    // theme's map. Without this, switching themes only overwrites keys present
    // in the NEW theme's object — any key set by a PREVIOUS theme but absent
    // from the new one (e.g. light-only ink/surface tokens) stays stuck as an
    // inline override, shadowing the CSS :root dark defaults forever.
    const allKeys = new Set<string>();
    Object.values(THEME_VARS).forEach(themeVars => {
      Object.keys(themeVars).forEach(k => allKeys.add(k));
    });
    allKeys.forEach(k => root.style.removeProperty(k));

    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

    // Mark light vs dark so components can adapt via [data-theme="light"] selectors
    root.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');

    // Update AppShell bg gradient via CSS var
    root.style.setProperty('--page-gradient',
      `linear-gradient(180deg, var(--page-bg-start) 0%, var(--page-bg-end) 100%)`);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isPro }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
