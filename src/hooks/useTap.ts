import { useCallback } from 'react';
import { useHaptic } from '@/hooks/useHaptic';
import { spring } from '@/lib/motion';
import type { TargetAndTransition } from 'framer-motion';

type HapticLevel = 'light' | 'medium' | 'heavy';
type TapSize     = 'primary' | 'standard' | 'small' | 'micro' | 'hard';

const TAP_SCALES: Record<TapSize, number> = {
  primary:  0.96,
  standard: 0.97,
  small:    0.93,
  micro:    0.88,
  hard:     0.90,
};

interface UseTapOptions {
  /** Named size preset — maps to a pre-tuned scale value */
  size?:   TapSize;
  /** Direct scale override — takes precedence over size */
  scale?:  number;
  /** Haptic pattern — only fires when explicitly set */
  haptic?: HapticLevel;
}

interface TapProps {
  whileTap:   TargetAndTransition;
  transition: typeof spring.snappy;
  onTapStart: () => void;
}

export function useTap(onTap: () => void, options: UseTapOptions = {}): TapProps & { onTap: () => void } {
  const { size = 'standard', scale, haptic } = options;
  const hap = useHaptic();

  // scale? wins; fall back to named size preset
  const resolvedScale = scale ?? TAP_SCALES[size];

  const onTapStart = useCallback(() => {
    if (haptic === 'light')  hap.light();
    if (haptic === 'medium') hap.medium();
    if (haptic === 'heavy')  hap.heavy();
  }, [haptic, hap]);

  return {
    whileTap:   { scale: resolvedScale },
    transition: spring.snappy,
    onTapStart,
    onTap,
  };
}
