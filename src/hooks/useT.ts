// ─────────────────────────────────────────────────────────────────────────────
// useT — static UI-chrome translation lookup.
//
// Reads the same profiles.preferred_language the AI content-translation paths
// already use (via useLanguage), but resolves instantly against the local
// UI_STRINGS dictionary — no LLM call, no network round-trip. Falls back to
// English when a key is missing for the current language.
// ─────────────────────────────────────────────────────────────────────────────

import { useLanguage } from '@/hooks/useLanguage';
import { UI_STRINGS, type UIStringKey } from '@/lib/i18n/uiStrings';
import { isValidLanguage } from '@/lib/language';

export function useT() {
  const { language } = useLanguage();
  const lang = isValidLanguage(language) ? language : 'en';

  return (key: UIStringKey): string => UI_STRINGS[lang][key] ?? UI_STRINGS.en[key] ?? key;
}
