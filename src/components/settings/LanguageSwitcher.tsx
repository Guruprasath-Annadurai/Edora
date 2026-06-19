import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { LANGUAGE_NAMES, LANGUAGE_NATIVE, type AppLanguage } from '@/lib/language';
import { track } from '@/lib/analytics';

const LANGUAGES = Object.entries(LANGUAGE_NAMES) as [AppLanguage, string][];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { profile, setProfile } = useAuth();
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);

  const current = (profile?.preferred_language ?? 'en') as AppLanguage;

  async function select(lang: AppLanguage) {
    if (lang === current || saving) return;
    setSaving(true);
    await supabase.from('profiles')
      .update({ preferred_language: lang })
      .eq('id', profile!.id);
    setProfile?.({ ...profile!, preferred_language: lang });
    track('language_changed', { from: current, to: lang });
    setSaving(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <motion.button whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
        style={{
          background: open ? 'rgba(91,106,245,0.15)' : 'var(--color-surface)',
          border: `1px solid ${open ? '#5B6AF5' : 'var(--color-border)'}`,
        }}>
        <Globe size={15} color={open ? '#A0AEFF' : 'var(--color-text-secondary)'} />
        {!compact && (
          <span className="text-sm font-medium" style={{ color: open ? '#A0AEFF' : 'var(--color-text)' }}>
            {LANGUAGE_NATIVE[current]}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div key="menu"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-50 rounded-2xl overflow-hidden shadow-2xl min-w-[200px]"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {LANGUAGES.map(([code, name]) => (
                <motion.button key={code} whileTap={{ scale: 0.98 }}
                  onClick={() => select(code)}
                  disabled={saving}
                  className="w-full flex items-center justify-between px-4 py-3 text-left transition-all hover:opacity-80"
                  style={{
                    background: code === current ? 'rgba(91,106,245,0.12)' : 'transparent',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: code === current ? '#A0AEFF' : 'var(--color-text)' }}>
                      {LANGUAGE_NATIVE[code]}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{name}</p>
                  </div>
                  {code === current && <Check size={15} color="#A0AEFF" />}
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
