/**
 * CharacterImage — production-grade illustrated character with live motion.
 *
 * Features:
 *  - WebP first, PNG fallback via <picture>
 *  - 6 animation presets (float, wave, bounce, sway, think, chill)
 *  - Fade-in entrance → seamless loop (nested wrapper pattern)
 *  - Respects prefers-reduced-motion (WCAG 2.1 §2.3.3)
 *  - aria-hidden + role="presentation" (purely decorative)
 *  - will-change: transform on GPU compositor thread
 *  - Emoji fallback if asset 404s
 *  - Zero layout shift: explicit height/width
 */
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

// ── Animation presets ─────────────────────────────────────────────────────────
// Each preset defines `animate` keyframes + `transition` for the outer wrapper.
// Inner <img> always gets a spring entrance (opacity 0→1, scale 0.85→1, y 20→0).

const PRESETS = {
  /** Calm hover — login, onboarding, privacy default */
  float: {
    animate: { y: [0, -10, 0] },
    transition: { duration: 3.2, ease: 'easeInOut', repeat: Infinity },
  },

  /** Active greeting wave — home screen header */
  wave: {
    animate: { y: [0, -8, 0, -4, 0], rotate: [0, 1.5, 0, -1.5, 0] },
    transition: { duration: 2.4, ease: 'easeInOut', repeat: Infinity },
  },

  /** Triumphant bounce — quiz win, sprint complete */
  bounce: {
    animate: { y: [0, -16, -4, -14, 0], scale: [1, 1.06, 1.02, 1.05, 1] },
    transition: { duration: 1.8, ease: [0.4, 0, 0.2, 1], repeat: Infinity },
  },

  /** Gentle sway — privacy policy */
  sway: {
    animate: { rotate: [-1.8, 1.8, -1.8], y: [0, -4, 0] },
    transition: { duration: 4, ease: 'easeInOut', repeat: Infinity },
  },

  /** Thinking headscraatch — quiz low score */
  think: {
    animate: { x: [-5, 5, -5], rotate: [-2.5, 2.5, -2.5] },
    transition: { duration: 3, ease: 'easeInOut', repeat: Infinity },
  },

  /** Lazy chill — flashcard empty */
  chill: {
    animate: { y: [0, -6, 0], rotate: [0, 0.8, 0] },
    transition: { duration: 5, ease: 'easeInOut', repeat: Infinity },
  },
};

export type CharacterAnim = keyof typeof PRESETS;

// ── Component ─────────────────────────────────────────────────────────────────

interface CharacterImageProps {
  /** Illustration slug — resolves to /illustrations/{slug}.webp (PNG fallback) */
  slug: string;
  /** Icon shown if both WebP and PNG fail to load */
  fallbackIcon?: React.ReactNode;
  /** Height in px. Omit (or pair with fillParent) to use CSS fluid sizing */
  height?: number;
  /** If true, img fills parent container (100% width+height). Use with a sized parent. */
  fillParent?: boolean;
  /** object-position when fillParent is true */
  objectPosition?: string;
  /** Motion preset */
  anim?: CharacterAnim;
  /** Extra CSS for the wrapper */
  className?: string;
  style?: React.CSSProperties;
  /** Extra motion delay before entrance (seconds) */
  delay?: number;
}

export function CharacterImage({
  slug,
  fallbackIcon = <BookOpen size={32} style={{ color: '#818CF8' }} strokeWidth={1.6} />,
  height = 160,
  fillParent = false,
  objectPosition = 'center bottom',
  anim = 'float',
  className = '',
  style,
  delay = 0,
}: CharacterImageProps) {
  const [failed, setFailed] = useState(false);
  const prefersReduced = useReducedMotion();

  const webp = `/illustrations/${slug}.webp`;
  const png  = `/illustrations/${slug}.png`;

  const preset = PRESETS[anim];

  // Static fallback — emoji in a styled box
  if (failed) {
    return (
      <div
        role="presentation"
        aria-hidden="true"
        className={`flex items-center justify-center rounded-3xl shrink-0 ${className}`}
        style={{
          height,
          width: height,
          background: 'rgba(91,106,245,0.1)',
          border: '2px solid rgba(91,106,245,0.15)',
          fontSize: height * 0.38,
          ...style,
        }}
      >
        {fallbackIcon}
      </div>
    );
  }

  const wrapperStyle: React.CSSProperties = fillParent
    ? { width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', ...style }
    : { height, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style };

  const imgStyle: React.CSSProperties = fillParent
    ? { width: '100%', height: '100%', objectFit: 'contain', objectPosition, willChange: 'transform', pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' }
    : { height, width: 'auto', objectFit: 'contain', willChange: 'transform', pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' };

  return (
    // Outer div: perpetual motion loop (disabled if reduced motion preferred)
    <motion.div
      aria-hidden="true"
      role="presentation"
      className={`shrink-0 ${className}`}
      style={wrapperStyle}
      animate={prefersReduced ? undefined : preset.animate}
      transition={prefersReduced ? undefined : preset.transition}
    >
      {/* Inner picture: entrance spring (runs once, then loop takes over) */}
      <motion.picture
        initial={{ opacity: 0, scale: 0.82, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, delay, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ display: fillParent ? 'flex' : 'contents', width: '100%', height: '100%' }}
      >
        <source srcSet={webp} type="image/webp" />
        <img
          src={png}
          alt=""
          role="presentation"
          draggable={false}
          loading="eager"
          decoding="async"
          style={imgStyle}
          onError={() => setFailed(true)}
        />
      </motion.picture>
    </motion.div>
  );
}
