// ═══════════════════════════════════════════════════════════════════════════════
// motion.ts — Edora Motion Design System
// Single source of truth for every spring, fade, easing, tap, and stagger value.
// Import from here. Never write raw stiffness/damping inline.
// ═══════════════════════════════════════════════════════════════════════════════

import type { TargetAndTransition, Transition, Variants } from 'framer-motion';

// ── Easing curves ────────────────────────────────────────────────────────────
// Named cubic-bezier values instead of magic 4-number arrays.

export const ease = {
  ios:       [0.32, 0.72, 0.00, 1.00] as const,  // iOS native feel — used in TabBar, sheets
  material:  [0.40, 0.00, 0.20, 1.00] as const,  // Material You enter/exit
  snap:      [0.34, 1.56, 0.64, 1.00] as const,  // Overshoot spring-like — CharacterImage entrance
  sharp:     [0.32, 0.72, 0.00, 1.00] as const,  // Same as ios — quick exits
  out:       [0.00, 0.00, 0.20, 1.00] as const,  // Standard ease-out
  inOut:     [0.42, 0.00, 0.58, 1.00] as const,  // Standard ease-in-out
} as const;

// ── Spring presets ───────────────────────────────────────────────────────────
// Use these as the `transition` prop on any motion element.

export const spring = {
  // Fast snappy feedback — button taps, toggles, connection pills
  snappy: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 30,
  },

  // Standard smooth — page-level cards, FAB entrance, feature cards
  smooth: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 28,
  },

  // Bottom-sheet slides — FlashcardSaveSheet, NovoMemoryPanel, DPDPConsent
  sheet: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },

  // Lazy / reveal — large panels, roadmap accordions, slow entrances
  lazy: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 26,
  },

  // Celebration bounce — XP pop, streak counter, achievement unlock
  bounce: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 20,
    mass: 0.8,
  },

  // Gentle settle — mood icons, tooltips, inline state changes
  gentle: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 40,
  },

  // Card entrance — list items, bento cards, staggered grids
  entrance: {
    type: 'spring' as const,
    stiffness: 320,
    damping: 30,
  },

  // Tight / notification — banners, toast, broadcast bar
  tight: {
    type: 'spring' as const,
    stiffness: 380,
    damping: 30,
  },
} as const;

// ── Duration presets ─────────────────────────────────────────────────────────
// For non-spring (duration-based) transitions. Always in seconds.

export const dur = {
  instant: 0.12,  // tab indicator, micro-toggle
  fast:    0.20,  // smart reply chips, icon swaps
  base:    0.30,  // standard fade, overlay backdrop
  slow:    0.45,  // character image entrance, page cross-fade
  xslow:   0.55,  // Novo avatar entrance, concept-of-day card
} as const;

// ── Fade / entrance variants ─────────────────────────────────────────────────
// Use as: <motion.div {...fade.up} transition={spring.smooth}>

export const fade = {
  // Subtle lift-in — default card/item entrance
  in: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: 4 },
  },

  // Standard lift-in — page sections, larger cards
  up: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y:  0 },
    exit:    { opacity: 0, y:  8 },
  },

  // Scale pop — achievement badges, modal confirmations
  pop: {
    initial: { opacity: 0, scale: 0.88 },
    animate: { opacity: 1, scale: 1    },
    exit:    { opacity: 0, scale: 0.92 },
  },

  // Backdrop — overlay dimming layer
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
  },

  // Slide from top — offline banner, broadcast bar
  down: {
    initial: { opacity: 0, y: -48 },
    animate: { opacity: 1, y:   0 },
    exit:    { opacity: 0, y: -48 },
  },

  // Slide from bottom — bottom sheets (content only, not the backdrop)
  slideUp: {
    initial: { y: '100%' },
    animate: { y: 0       },
    exit:    { y: '100%'  },
  },

  // Connection pill / notification pill — drop in from top-right
  pill: {
    initial: { opacity: 0, y: -6,  scale: 0.92 },
    animate: { opacity: 1, y:  0,  scale: 1     },
    exit:    { opacity: 0, y: -6,  scale: 0.92  },
  },

  // XP / score counter pop — grows in with bounce
  xp: {
    initial: { opacity: 0, scale: 0.70, y: 0   },
    animate: { opacity: 1, scale: 1.00, y: -28 },
    exit:    { opacity: 0, scale: 0.90, y: -44 },
  },
} as const;

// ── Variants (Framer Motion Variants API) ────────────────────────────────────
// Use with variants prop for staggered lists.

export const listVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y:  0, transition: spring.entrance },
};

export const gridVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.03,
    },
  },
};

export const gridItemVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 8 },
  show:   { opacity: 1, scale: 1.00, y: 0, transition: spring.entrance },
};

// ── Tap targets ──────────────────────────────────────────────────────────────
// Semantic scale values for whileTap. Import and spread directly.

export const tap = {
  // Primary CTA — large buttons, hero actions
  primary:  { whileTap: { scale: 0.96 } as TargetAndTransition },
  // Standard interactive — cards, chips, list items
  standard: { whileTap: { scale: 0.97 } as TargetAndTransition },
  // Small / icon buttons — toolbar buttons, emoji, tiny chips
  small:    { whileTap: { scale: 0.93 } as TargetAndTransition },
  // Micro — very small icon-only buttons (AI feedback thumbs, close X)
  micro:    { whileTap: { scale: 0.88 } as TargetAndTransition },
  // Aggressive — game-like, quiz answer taps
  hard:     { whileTap: { scale: 0.90 } as TargetAndTransition },
} as const;

// ── Stagger delay helpers ────────────────────────────────────────────────────
// staggerDelay(i) → i * STAGGER_STEP for inline stagger without Variants API.

const STAGGER_STEP = 0.06;
export const staggerDelay = (i: number, base = 0): number => base + i * STAGGER_STEP;

// Finer control:
export const stagger = {
  fast:   (i: number, base = 0) => base + i * 0.04,
  normal: (i: number, base = 0) => base + i * 0.06,
  slow:   (i: number, base = 0) => base + i * 0.10,
} as const;

// ── Overlay / sheet transition factory ──────────────────────────────────────
// Returns { initial, animate, exit, transition } for standard overlay pattern.
// Avoids repeating the same 4-prop object in every sheet.

export function sheetTransition(from: 'bottom' | 'top' | 'left' | 'right' = 'bottom') {
  const vectors: Record<typeof from, Record<string, string | number>> = {
    bottom: { y: '100%' },
    top:    { y: '-100%' },
    left:   { x: '-100%' },
    right:  { x: '100%' },
  };
  const v = vectors[from];
  return {
    initial:    v,
    animate:    { y: 0, x: 0 },
    exit:       v,
    transition: spring.sheet,
  } as const;
}

// ── Reduced-motion safe wrappers ─────────────────────────────────────────────
// Pass prefersReduced=true to strip animation while keeping layout intact.

export function safeTransition(
  transition: Transition,
  prefersReduced: boolean,
): Transition | undefined {
  return prefersReduced ? { duration: 0.01 } : transition;
}

export function safeVariants(variants: Variants, prefersReduced: boolean): Variants {
  if (!prefersReduced) return variants;
  return Object.fromEntries(
    Object.entries(variants).map(([k, v]) => [k, { ...(v as object), transition: { duration: 0.01 } }])
  );
}
