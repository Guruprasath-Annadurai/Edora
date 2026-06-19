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
  },
  default: {
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
