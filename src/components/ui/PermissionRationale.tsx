import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { spring } from '@/lib/motion';
import { Button } from '@/components/ui/button';

interface PermissionRationaleProps {
  open: boolean;
  icon?: React.ReactNode;
  title: string;
  description: string;
  allowLabel?: string;
  denyLabel?: string;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionRationale({
  open, icon, title, description,
  allowLabel = 'Allow', denyLabel = 'Not now',
  onAllow, onDeny,
}: PermissionRationaleProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="perm-rationale-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={onDeny}
        >
          <motion.div
            key="perm-rationale-sheet"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={spring.entrance}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-5"
            style={{ background: 'linear-gradient(160deg,var(--grad-permission-1),var(--grad-permission-2))', border: '1px solid var(--ink-100)' }}
          >
            <button onClick={onDeny} aria-label="Close"
              className="self-end w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
              style={{ background: 'var(--ink-070)' }}>
              <X size={15} className="text-white/60" />
            </button>

            <div className="flex flex-col items-center gap-4 text-center -mt-2">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                {icon ?? <Bell size={28} className="text-white" />}
              </div>
              <div>
                <h3 className="font-heading font-bold text-white text-lg leading-tight">{title}</h3>
                <p className="text-sm text-white/60 mt-2 leading-relaxed">{description}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              <Button size="lg" className="w-full" onClick={onAllow}>{allowLabel}</Button>
              <button onClick={onDeny}
                className="w-full py-3 text-sm font-semibold text-white/50 active:opacity-70">
                {denyLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
