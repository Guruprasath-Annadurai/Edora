import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { useLanguage, SUPPORTED_LANGUAGES } from '@/hooks/useLanguage';

interface LanguageSelectorProps {
  compact?: boolean;   // inline chip mode for header bars
  className?: string;
}

export function LanguageSelector({ compact = false, className = '' }: LanguageSelectorProps) {
  const { language, setLanguage, saving, langOption } = useLanguage();
  const [open, setOpen] = useState(false);

  async function select(code: string) {
    setOpen(false);
    await setLanguage(code);
  }

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-white text-xs font-semibold text-foreground active:scale-95 transition-transform shadow-sm"
          disabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <span>{langOption.flag}</span>}
          <span className="hidden xs:block">{langOption.native}</span>
          <ChevronDown size={11} className="text-muted-foreground" />
        </button>

        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-border rounded-2xl shadow-xl overflow-hidden min-w-[160px]">
                {SUPPORTED_LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => select(lang.code)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors text-left">
                    <span className="text-base leading-none">{lang.flag}</span>
                    <span className="flex-1 font-medium text-foreground">{lang.native}</span>
                    {language === lang.code && <Check size={13} className="text-primary shrink-0" />}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full-page card variant for AccountSettings
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {SUPPORTED_LANGUAGES.map(lang => (
        <button
          key={lang.code}
          onClick={() => select(lang.code)}
          disabled={saving}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left active:scale-[0.99]"
          style={language === lang.code
            ? { background: 'rgba(91,106,245,0.08)', borderColor: '#5B6AF5' }
            : { background: '#fff', borderColor: '#E4E8F7' }}>
          <span className="text-2xl leading-none">{lang.flag}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold leading-tight ${language === lang.code ? 'text-primary' : 'text-foreground'}`}>
              {lang.native}
            </p>
            <p className="text-xs text-muted-foreground">{lang.label}</p>
          </div>
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
            ${language === lang.code ? 'border-primary' : 'border-border'}`}>
            {language === lang.code && <div className="w-2 h-2 rounded-full bg-primary" />}
          </div>
        </button>
      ))}
      {saving && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
          <Loader2 size={11} className="animate-spin" /> Saving preference…
        </p>
      )}
    </div>
  );
}
