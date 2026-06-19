import { motion } from 'framer-motion';
import { Swords, Clock, ChevronRight, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface WarRoomBannerProps {
  examName: string;
  hoursLeft: number;
}

export function WarRoomBanner({ examName, hoursLeft }: WarRoomBannerProps) {
  const navigate = useNavigate();
  const isUltra  = hoursLeft <= 12;
  const label    = hoursLeft < 1 ? 'EXAM IN PROGRESS' : hoursLeft < 24
    ? `${hoursLeft}h left`
    : `${Math.round(hoursLeft / 24)}d left`;

  return (
    <motion.button
      onClick={() => navigate('/battle')}
      style={{
        width: '100%',
        borderRadius: 18,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: isUltra
          ? 'linear-gradient(135deg, rgba(239,68,68,0.22), rgba(220,38,38,0.14))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(124,58,237,0.12))',
        border: isUltra
          ? '1.5px solid rgba(239,68,68,0.5)'
          : '1.5px solid rgba(239,68,68,0.3)',
        boxShadow: isUltra
          ? '0 4px 24px rgba(239,68,68,0.3)'
          : '0 2px 12px rgba(239,68,68,0.15)',
        cursor: 'pointer',
        textAlign: 'left',
        minHeight: 44,
      }}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Icon */}
      <motion.div
        style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(239,68,68,0.3)',
        }}
        animate={isUltra ? { scale: [1, 1.08, 1] } : {}}
        transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
      >
        {isUltra
          ? <Flame size={20} style={{ color: '#EF4444' }} />
          : <Swords size={20} style={{ color: '#EF4444' }} />
        }
      </motion.div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#EF4444', textTransform: 'uppercase' }}>
            WAR ROOM
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
            background: 'rgba(239,68,68,0.2)', color: '#EF4444',
            border: '1px solid rgba(239,68,68,0.3)',
          }}>
            {label}
          </span>
          {isUltra && (
            <motion.div
              style={{
                width: 6, height: 6, borderRadius: '50%', background: '#EF4444',
              }}
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            />
          )}
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', lineHeight: 1.3 }}>
          {examName} • Final prep mode
        </p>
      </div>

      <ChevronRight size={16} style={{ color: 'rgba(239,68,68,0.7)', flexShrink: 0 }} />
    </motion.button>
  );
}
