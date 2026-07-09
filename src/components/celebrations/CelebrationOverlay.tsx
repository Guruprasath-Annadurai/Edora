import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import { useState } from 'react';
import { Trophy, Zap, Star, Flame } from 'lucide-react';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export type CelebrationKind = 'streak' | 'levelup' | 'battle' | 'perfect' | 'xp';

interface CelebrationConfig {
  kind: CelebrationKind;
  title: string;
  subtitle: string;
  xp?: number;
  level?: number;
  streak?: number;
}

export interface CelebrationHandle {
  trigger: (cfg: CelebrationConfig) => void;
}

// ── Canvas confetti ───────────────────────────────────────────────────────────
const COLORS = ['#5B6AF5','#8B5CF6','#EC4899','#F59E0B','#10B981','#06B6D4','#EF4444','#FBBF24'];
interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rot: number; rotSpeed: number; opacity: number; shape: 'rect'|'circle';
}

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = Array.from({ length: 120 }, () => ({
      x:        Math.random() * canvas.width,
      y:        -Math.random() * canvas.height * 0.5,
      vx:       (Math.random() - 0.5) * 6,
      vy:       Math.random() * 4 + 2,
      size:     Math.random() * 8 + 4,
      color:    COLORS[Math.floor(Math.random() * COLORS.length)],
      rot:      Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.15,
      opacity:  1,
      shape:    Math.random() > 0.5 ? 'rect' : 'circle',
    }));

    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      particles.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.08; // gravity
        p.rot += p.rotSpeed;
        if (frame > 80) p.opacity = Math.max(0, p.opacity - 0.015);
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      if (frame < 160) animRef.current = requestAnimationFrame(draw);
    }
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}

// ── XP float badge ────────────────────────────────────────────────────────────
function XPBadge({ xp }: { xp: number }) {
  return (
    <motion.div
      initial={{ scale: 0, y: 20 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ ...spring.bounce, delay: 0.4 }}
      className="flex items-center gap-2 px-5 py-2.5 rounded-full"
      style={{
        background: 'linear-gradient(135deg,rgba(234,179,8,0.2),rgba(245,158,11,0.15))',
        border: '1.5px solid rgba(234,179,8,0.4)',
        boxShadow: '0 4px 24px rgba(234,179,8,0.3)',
      }}
    >
      <Star size={16} style={{ color: '#EAB308', fill: '#EAB308' }} />
      <span className="font-heading font-extrabold text-lg" style={{ color: '#FDE68A' }}>
        +{xp} XP
      </span>
    </motion.div>
  );
}

// ── Icon per kind ─────────────────────────────────────────────────────────────
const KIND_META: Record<CelebrationKind, { icon: React.ComponentType<{ size?: number | string; className?: string }>, gradient: string, glow: string, iconColor: string }> = {
  streak:  { icon: Flame,  gradient: 'linear-gradient(135deg,#F97316,#EF4444)', glow: 'rgba(249,115,22,0.6)',   iconColor: '#FED7AA' },
  levelup: { icon: Zap,    gradient: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', glow: 'rgba(91,106,245,0.6)',   iconColor: '#C7D2FE' },
  battle:  { icon: Trophy, gradient: 'linear-gradient(135deg,#EAB308,#F59E0B)', glow: 'rgba(234,179,8,0.6)',    iconColor: '#FEF08A' },
  perfect: { icon: Star,   gradient: 'linear-gradient(135deg,#10B981,#06B6D4)', glow: 'rgba(16,185,129,0.6)',   iconColor: '#A7F3D0' },
  xp:      { icon: Star,   gradient: 'linear-gradient(135deg,#EAB308,#5B6AF5)', glow: 'rgba(234,179,8,0.5)',    iconColor: '#FEF08A' },
};

// ── Main overlay ──────────────────────────────────────────────────────────────
export const CelebrationOverlay = forwardRef<CelebrationHandle>((_, ref) => {
  const [cfg, setCfg]         = useState<CelebrationConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const timeoutRef            = useRef<ReturnType<typeof setTimeout>>();

  const trigger = useCallback((config: CelebrationConfig) => {
    setCfg(config);
    setVisible(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(false), 3200);

    // Haptic burst
    if (Capacitor.isNativePlatform()) {
      if (config.kind === 'levelup' || config.kind === 'battle') {
        Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      } else {
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      }
    }
  }, []);

  useImperativeHandle(ref, () => ({ trigger }), [trigger]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const meta = cfg ? KIND_META[cfg.kind] : null;
  const Icon = meta?.icon ?? Star;

  return (
    <AnimatePresence>
      {visible && cfg && meta && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ zIndex: 9999 }}
          onClick={() => setVisible(false)}
        >
          {/* Dim backdrop */}
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />

          {/* Confetti */}
          <ConfettiCanvas />

          {/* Content card */}
          <motion.div
            initial={{ scale: 0.5, y: 60, opacity: 0 }}
            animate={{ scale: 1,   y: 0,  opacity: 1 }}
            exit={{ scale: 0.85, y: -30, opacity: 0 }}
            transition={spring.bounce}
            className="relative z-10 flex flex-col items-center gap-4 px-8 py-8 rounded-3xl mx-6"
            style={{
              background: 'var(--surface-scrim)',
              border: '1.5px solid var(--ink-120)',
              boxShadow: `0 0 80px ${meta.glow}, 0 20px 60px rgba(0,0,0,0.6)`,
              maxWidth: 320,
            }}
          >
            {/* Pulse ring */}
            <div className="relative">
              <motion.div
                className="absolute inset-0 rounded-full"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
                style={{ background: meta.gradient }}
              />
              <motion.div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                initial={{ rotate: -15, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ ...spring.bounce, delay: 0.05 }}
                style={{ background: meta.gradient, boxShadow: `0 8px 32px ${meta.glow}` }}
              >
                <Icon size={36} style={{ color: meta.iconColor }} />
              </motion.div>
            </div>

            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="font-heading text-2xl font-extrabold text-white mb-1"
              >
                {cfg.title}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-sm text-white/55 leading-snug"
              >
                {cfg.subtitle}
              </motion.p>
            </div>

            {cfg.xp && <XPBadge xp={cfg.xp} />}

            {cfg.kind === 'levelup' && cfg.level && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...spring.bounce, delay: 0.45 }}
                className="flex items-center gap-2"
              >
                <div
                  className="px-4 py-2 rounded-2xl font-heading font-extrabold text-2xl"
                  style={{
                    background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                    color: 'var(--ink-950)',
                    boxShadow: '0 4px 20px rgba(91,106,245,0.5)',
                  }}
                >
                  Lv. {cfg.level}
                </div>
              </motion.div>
            )}

            {cfg.kind === 'streak' && cfg.streak && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...spring.bounce, delay: 0.45 }}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl"
                style={{ background: 'rgba(249,115,22,0.15)', border: '1.5px solid rgba(249,115,22,0.3)' }}
              >
                <Flame size={18} style={{ color: '#FB923C', filter: 'drop-shadow(0 0 6px rgba(251,146,60,0.8))' }} />
                <span className="font-heading font-extrabold text-xl" style={{ color: '#FED7AA' }}>
                  {cfg.streak} day streak!
                </span>
              </motion.div>
            )}

            <p className="text-xs text-white/25 font-semibold">Tap anywhere to dismiss</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
CelebrationOverlay.displayName = 'CelebrationOverlay';

// ── Singleton trigger (global ref) ────────────────────────────────────────────
let _globalRef: CelebrationHandle | null = null;
export function setCelebrationRef(ref: CelebrationHandle | null) { _globalRef = ref; }
export function celebrate(cfg: CelebrationConfig) { _globalRef?.trigger(cfg); }
