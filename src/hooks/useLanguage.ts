import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export interface LanguageOption {
  code: string;
  label: string;       // English name
  native: string;      // Name in that language
  flag: string;        // Emoji flag
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English',    native: 'English',    flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi',      native: 'हिंदी',       flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil',      native: 'தமிழ்',       flag: '🇮🇳' },
  { code: 'te', label: 'Telugu',     native: 'తెలుగు',      flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada',    native: 'ಕನ್ನಡ',       flag: '🇮🇳' },
  { code: 'bn', label: 'Bengali',    native: 'বাংলা',        flag: '🇮🇳' },
  { code: 'mr', label: 'Marathi',    native: 'मराठी',        flag: '🇮🇳' },
  { code: 'gu', label: 'Gujarati',   native: 'ગુજરાતી',      flag: '🇮🇳' },
  { code: 'pa', label: 'Punjabi',    native: 'ਪੰਜਾਬੀ',       flag: '🇮🇳' },
];

export function useLanguage() {
  const { profile, refetchProfile } = useAuth();

  const language = profile?.preferred_language ?? 'en';

  const [saving, setSaving] = useState(false);

  const setLanguage = useCallback(async (code: string) => {
    if (!profile || code === language) return;
    setSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({ preferred_language: code })
        .eq('id', profile.id);
      await refetchProfile();
    } catch (err) {
      console.error('[useLanguage] setLanguage error:', err);
    } finally {
      setSaving(false);
    }
  }, [profile, language, refetchProfile]);

  const getLangOption = useCallback((code: string): LanguageOption => {
    return SUPPORTED_LANGUAGES.find(l => l.code === code) ?? SUPPORTED_LANGUAGES[0];
  }, []);

  return {
    language,
    setLanguage,
    saving,
    langOption: getLangOption(language),
    supported: SUPPORTED_LANGUAGES,
  };
}
