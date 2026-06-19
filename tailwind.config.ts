import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body:    ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        novo: {
          purple: '#7C3AED',
          light:  '#A855F7',
          dark:   '#5B21B6',
          cyan:   '#06B6D4',
          pink:   '#EC4899',
          war:    '#EF4444',
          xp:     '#F59E0B',
          win:    '#10B981',
        },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      height: { screen: '100dvh' },
      minHeight: { screen: '100dvh' },
      backgroundImage: {
        'novo-gradient':  'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
        'novo-gradient-dark': 'linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)',
        'war-gradient':   'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        'xp-gradient':    'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
        'win-gradient':   'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'card-ai':        'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(168,85,247,0.08) 100%)',
      },
      boxShadow: {
        glass:    '0 2px 12px rgba(124,58,237,0.08)',
        novo:     '0 0 28px rgba(124,58,237,0.4)',
        'novo-lg':'0 0 48px rgba(124,58,237,0.5)',
        card:     '0 2px 16px rgba(0,0,0,0.4)',
        'card-lg':'0 8px 32px rgba(0,0,0,0.5)',
        war:      '0 4px 24px rgba(239,68,68,0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(124,58,237,0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(124,58,237,0.7)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        // Design-system tokens — use these, not arbitrary px values
        'chip':  '0.5rem',   // 8px  — tags, badges, small labels
        'card':  '1.25rem',  // 20px — standard content card
        'panel': '1.5rem',   // 24px — large panels, modals (= 3xl)
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
