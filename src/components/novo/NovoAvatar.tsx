import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export type NovoState = 'idle' | 'thinking' | 'talking' | 'celebrating' | 'concerned' | 'voice';

interface NovoAvatarProps {
  state?: NovoState;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showLabel?: boolean;
}

// ── Pixel art palette ─────────────────────────────────────────────────────────
const B = '#C87C52';   // body orange-brown
const D = '#8C4A28';   // dark shadow / legs
const E = '#1C0F08';   // eye / very dark
const S = '#E09060';   // highlight / lighter orange
const N = null;        // transparent

// ── Sprite frames ─────────────────────────────────────────────────────────────
// 9 cols × 13 rows — idle frame
const IDLE: (string | null)[][] = [
  [N, N, N, B, B, B, B, N, N],
  [N, N, B, B, B, B, B, B, N],
  [N, N, B, E, S, S, E, B, N],
  [N, N, B, B, B, B, B, B, N],
  [N, B, B, B, B, B, B, B, B],
  [N, B, S, B, B, B, B, S, B],
  [N, B, B, B, B, B, B, B, B],
  [N, N, D, B, B, B, B, D, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, D, N, N, D, N, N],
  [N, N, N, B, N, N, B, N, N],
  [N, N, D, D, N, N, D, D, N],
];

// Walk frame 1 — legs apart
const WALK1: (string | null)[][] = [
  [N, N, N, B, B, B, B, N, N],
  [N, N, B, B, B, B, B, B, N],
  [N, N, B, E, S, S, E, B, N],
  [N, N, B, B, B, B, B, B, N],
  [N, B, B, B, B, B, B, B, B],
  [N, B, S, B, B, B, B, S, B],
  [N, B, B, B, B, B, B, B, B],
  [N, N, D, B, B, B, B, D, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, D, D, N, N, N, D, N],
  [N, N, B, N, N, N, N, B, N],
  [N, D, D, N, N, N, D, D, N],
];

// Walk frame 2 — legs together
const WALK2: (string | null)[][] = [
  [N, N, N, B, B, B, B, N, N],
  [N, N, B, B, B, B, B, B, N],
  [N, N, B, E, S, S, E, B, N],
  [N, N, B, B, B, B, B, B, N],
  [N, B, B, B, B, B, B, B, B],
  [N, B, S, B, B, B, B, S, B],
  [N, B, B, B, B, B, B, B, B],
  [N, N, D, B, B, B, B, D, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, D, B, B, D, N, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, D, D, N, N, D, D, N],
];

// Celebrating — arms up
const CELEBRATE: (string | null)[][] = [
  [N, N, N, B, B, B, B, N, N],
  [N, N, B, B, B, B, B, B, N],
  [N, N, B, E, S, S, E, B, N],
  [N, N, B, B, B, B, B, B, N],
  [B, B, B, B, B, B, B, B, B],
  [B, S, N, B, B, B, N, S, B],
  [N, N, B, B, B, B, B, N, N],
  [N, N, D, B, B, B, B, D, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, D, N, N, D, N, N],
  [N, N, N, B, N, N, B, N, N],
  [N, N, D, D, N, N, D, D, N],
];

// Concerned — slight droop
const CONCERNED: (string | null)[][] = [
  [N, N, N, B, B, B, B, N, N],
  [N, N, B, B, B, B, B, B, N],
  [N, N, B, E, B, B, E, B, N],
  [N, N, B, B, B, B, B, B, N],
  [N, B, B, B, B, B, B, B, B],
  [N, B, B, B, B, B, B, B, B],
  [N, D, B, B, B, B, B, B, D],
  [N, N, D, B, B, B, B, D, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, B, B, B, B, N, N],
  [N, N, N, D, N, N, D, N, N],
  [N, N, N, B, N, N, B, N, N],
  [N, N, D, D, N, N, D, D, N],
];

// Thinking dots overlay
const THINKING_DOTS = ['#7C3AED', '#A855F7', '#C084FC'];

type SpriteGrid = (string | null)[][];

function PixelSprite({ grid, pixelSize }: { grid: SpriteGrid; pixelSize: number }) {
  return (
    <svg
      width={grid[0].length * pixelSize}
      height={grid.length * pixelSize}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    >
      {grid.map((row, r) =>
        row.map((color, c) =>
          color ? (
            <rect
              key={`${r}-${c}`}
              x={c * pixelSize}
              y={r * pixelSize}
              width={pixelSize}
              height={pixelSize}
              fill={color}
            />
          ) : null
        )
      )}
    </svg>
  );
}

// Size → pixel size mapping (each "pixel" in the sprite = N screen px)
const PIXEL_SIZE_MAP = { sm: 3, md: 4, lg: 5, xl: 7 };

export function NovoAvatar({ state = 'idle', size = 'md', className, showLabel }: NovoAvatarProps) {
  const px = PIXEL_SIZE_MAP[size];

  // Choose sprite based on state
  const baseSprite =
    state === 'celebrating' ? CELEBRATE :
    state === 'concerned'   ? CONCERNED :
    IDLE;

  // Animation props per state
  const bodyAnim =
    state === 'idle'        ? { y: [0, -px * 0.6, 0] } :
    state === 'thinking'    ? { rotate: [-2, 2, -2] } :
    state === 'talking'     ? { y: [0, -px * 0.4, 0, -px * 0.3, 0] } :
    state === 'celebrating' ? { y: [0, -px * 2, 0, -px * 1.5, 0], rotate: [0, -6, 6, -3, 0] } :
    state === 'concerned'   ? { x: [-px * 0.3, px * 0.3, -px * 0.3] } :
    state === 'voice'       ? { y: [0, -px * 0.5, 0, -px * 0.5, 0] } :
    {};

  const bodyTransition =
    state === 'celebrating' ? { duration: 0.6, ease: 'easeOut' as const } :
    state === 'idle'        ? { repeat: Infinity, duration: 2.5, ease: 'easeInOut' as const } :
    state === 'thinking'    ? { repeat: Infinity, duration: 1.8, ease: 'easeInOut' as const } :
    state === 'talking'     ? { repeat: Infinity, duration: 0.45, ease: 'easeInOut' as const } :
    state === 'concerned'   ? { repeat: Infinity, duration: 1.2, ease: 'easeInOut' as const } :
    state === 'voice'       ? { repeat: Infinity, duration: 0.5, ease: 'easeInOut' as const } :
    {};

  // Walking legs animation (alternate WALK1/WALK2) for talking/voice
  const isWalking = state === 'talking' || state === 'voice';

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div style={{ position: 'relative' }}>
        {/* Glow platform shadow */}
        <motion.div
          style={{
            position: 'absolute',
            bottom: -px,
            left: '50%',
            transform: 'translateX(-50%)',
            width: px * 6,
            height: px * 1.5,
            borderRadius: '50%',
            background: 'rgba(200, 124, 82, 0.25)',
            filter: 'blur(4px)',
          }}
          animate={state === 'idle' ? { scaleX: [1, 0.85, 1], opacity: [0.5, 0.3, 0.5] } : {}}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
        />

        {/* Main character */}
        <motion.div
          animate={bodyAnim}
          transition={bodyTransition}
          style={{ display: 'inline-block', position: 'relative' }}
        >
          <AnimatePresence mode="wait">
            {state === 'thinking' ? (
              <motion.div key="thinking"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'relative' }}
              >
                <PixelSprite grid={IDLE} pixelSize={px} />
                {/* Floating thinking dots above */}
                <div style={{
                  position: 'absolute',
                  top: -px * 3,
                  right: -px,
                  display: 'flex',
                  gap: px * 0.5,
                  alignItems: 'flex-end',
                }}>
                  {THINKING_DOTS.map((color, i) => (
                    <motion.div
                      key={i}
                      style={{ width: px, height: px, borderRadius: '50%', background: color }}
                      animate={{ y: [0, -px * 1.2, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.2, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
              </motion.div>
            ) : isWalking ? (
              <motion.div key="walking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <WalkingSprite px={px} />
              </motion.div>
            ) : (
              <motion.div key="base" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <PixelSprite grid={baseSprite} pixelSize={px} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Celebrating — confetti pixels */}
          <AnimatePresence>
            {state === 'celebrating' && (
              <>
                {['#F59E0B', '#EF4444', '#10B981', '#7C3AED', '#EC4899', '#06B6D4'].map((color, i) => {
                  const angle = (i / 6) * 360;
                  return (
                    <motion.div
                      key={i}
                      style={{
                        position: 'absolute',
                        top: '50%', left: '50%',
                        width: px, height: px,
                        background: color,
                      }}
                      initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                      animate={{
                        x: Math.cos((angle * Math.PI) / 180) * px * 8,
                        y: Math.sin((angle * Math.PI) / 180) * px * 8,
                        opacity: [1, 1, 0],
                        scale: [0, 1, 0],
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.03 }}
                    />
                  );
                })}
              </>
            )}
          </AnimatePresence>

          {/* Voice — sound wave bars beside character */}
          {state === 'voice' && (
            <div style={{
              position: 'absolute',
              right: -px * 4,
              top: '30%',
              display: 'flex',
              flexDirection: 'column',
              gap: px * 0.4,
            }}>
              {[0.6, 1, 0.7].map((amp, i) => (
                <motion.div
                  key={i}
                  style={{ width: px, height: px * amp * 2, borderRadius: 1, background: '#7C3AED' }}
                  animate={{ scaleY: [amp, amp * 0.3, amp * 1.4, amp * 0.5, amp] }}
                  transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.1, ease: 'easeInOut' }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {showLabel && (
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.12em',
          color: '#C87C52',
          textTransform: 'uppercase',
          fontFamily: 'monospace',
        }}>
          NOVO
        </span>
      )}
    </div>
  );
}

// ── Walking animation — alternates WALK1 / WALK2 ─────────────────────────────
function WalkingSprite({ px }: { px: number }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="w1"
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 1, 0, 0, 1] }}
        transition={{ repeat: Infinity, duration: 0.5, ease: 'steps(1)' }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <PixelSprite grid={WALK1} pixelSize={px} />
      </motion.div>
      <motion.div
        key="w2"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 0.5, ease: 'steps(1)' }}
      >
        <PixelSprite grid={WALK2} pixelSize={px} />
      </motion.div>
    </AnimatePresence>
  );
}
