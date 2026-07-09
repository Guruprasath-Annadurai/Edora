export type FeatureKey =
  | 'chat'
  | 'flashcards'
  | 'sprint'
  | 'leaderboard'
  | 'reads'
  | 'scanner'
  | 'battle'
  | 'profile';

export interface FeatureTheme {
  accent:       string;
  accent2:      string;
  accentRgb:    string;
  gradient:     string;
  glowRgba:     string;
  iconBg:       string;
  iconBorder:   string;
  ctaGradient:  string;
  meshGradient: string;
  borderActive: string;
}

const themes: Record<FeatureKey, FeatureTheme> = {
  chat: {
    accent:       '#6B7BF7',
    accent2:      '#8B5CF6',
    accentRgb:    '107,123,247',
    gradient:     'linear-gradient(135deg, #6B7BF7 0%, #8B5CF6 100%)',
    glowRgba:     'rgba(107,123,247,0.35)',
    iconBg:       'rgba(107,123,247,0.14)',
    iconBorder:   'rgba(107,123,247,0.28)',
    ctaGradient:  'linear-gradient(135deg, #5B6AF5 0%, #7C3AED 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(107,123,247,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(139,92,246,0.12) 0%, transparent 65%)',
    borderActive: 'rgba(107,123,247,0.45)',
  },
  flashcards: {
    accent:       '#10B981',
    accent2:      '#06B6D4',
    accentRgb:    '16,185,129',
    gradient:     'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
    glowRgba:     'rgba(16,185,129,0.35)',
    iconBg:       'rgba(16,185,129,0.12)',
    iconBorder:   'rgba(16,185,129,0.28)',
    ctaGradient:  'linear-gradient(135deg, #059669 0%, #0891B2 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(16,185,129,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(6,182,212,0.12) 0%, transparent 65%)',
    borderActive: 'rgba(16,185,129,0.45)',
  },
  sprint: {
    accent:       '#F59E0B',
    accent2:      '#EF4444',
    accentRgb:    '245,158,11',
    gradient:     'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
    glowRgba:     'rgba(245,158,11,0.35)',
    iconBg:       'rgba(245,158,11,0.12)',
    iconBorder:   'rgba(245,158,11,0.28)',
    ctaGradient:  'linear-gradient(135deg, #D97706 0%, #DC2626 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(245,158,11,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(239,68,68,0.12) 0%, transparent 65%)',
    borderActive: 'rgba(245,158,11,0.45)',
  },
  leaderboard: {
    accent:       '#F59E0B',
    accent2:      '#EAB308',
    accentRgb:    '245,158,11',
    gradient:     'linear-gradient(135deg, #F59E0B 0%, #EAB308 100%)',
    glowRgba:     'rgba(245,158,11,0.40)',
    iconBg:       'rgba(245,158,11,0.12)',
    iconBorder:   'rgba(245,158,11,0.30)',
    ctaGradient:  'linear-gradient(135deg, #D97706 0%, #CA8A04 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(245,158,11,0.20) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(234,179,8,0.12) 0%, transparent 65%)',
    borderActive: 'rgba(245,158,11,0.50)',
  },
  reads: {
    accent:       '#06B6D4',
    accent2:      '#3B82F6',
    accentRgb:    '6,182,212',
    gradient:     'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    glowRgba:     'rgba(6,182,212,0.35)',
    iconBg:       'rgba(6,182,212,0.12)',
    iconBorder:   'rgba(6,182,212,0.28)',
    ctaGradient:  'linear-gradient(135deg, #0891B2 0%, #2563EB 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(6,182,212,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(59,130,246,0.12) 0%, transparent 65%)',
    borderActive: 'rgba(6,182,212,0.45)',
  },
  scanner: {
    accent:       '#A855F7',
    accent2:      '#EC4899',
    accentRgb:    '168,85,247',
    gradient:     'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)',
    glowRgba:     'rgba(168,85,247,0.35)',
    iconBg:       'rgba(168,85,247,0.12)',
    iconBorder:   'rgba(168,85,247,0.28)',
    ctaGradient:  'linear-gradient(135deg, #9333EA 0%, #DB2777 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(168,85,247,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(236,72,153,0.12) 0%, transparent 65%)',
    borderActive: 'rgba(168,85,247,0.45)',
  },
  battle: {
    accent:       '#EF4444',
    accent2:      '#F97316',
    accentRgb:    '239,68,68',
    gradient:     'linear-gradient(135deg, #EF4444 0%, #F97316 100%)',
    glowRgba:     'rgba(239,68,68,0.35)',
    iconBg:       'rgba(239,68,68,0.12)',
    iconBorder:   'rgba(239,68,68,0.28)',
    ctaGradient:  'linear-gradient(135deg, #DC2626 0%, #EA580C 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(239,68,68,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(249,115,22,0.12) 0%, transparent 65%)',
    borderActive: 'rgba(239,68,68,0.45)',
  },
  profile: {
    accent:       '#6B7BF7',
    accent2:      '#A78BFA',
    accentRgb:    '107,123,247',
    gradient:     'linear-gradient(135deg, #6B7BF7 0%, #A78BFA 100%)',
    glowRgba:     'rgba(107,123,247,0.30)',
    iconBg:       'rgba(107,123,247,0.12)',
    iconBorder:   'rgba(107,123,247,0.25)',
    ctaGradient:  'linear-gradient(135deg, #5B6AF5 0%, #8B5CF6 100%)',
    meshGradient: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(107,123,247,0.16) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(167,139,250,0.10) 0%, transparent 65%)',
    borderActive: 'rgba(107,123,247,0.40)',
  },
};

export function getFeatureTheme(key: FeatureKey): FeatureTheme {
  return themes[key];
}

export { themes as featureThemes };
