// ─────────────────────────────────────────────────────────────────────────────
// UI chrome translations — nav labels, buttons, page titles.
//
// Deliberately separate from the AI-content translation paths (novo-language,
// RegionalLanguagePage's question translation, getLangInstruction() for
// Gemini system prompts) — this dictionary is for static UI strings that
// never touch an LLM, so they render instantly with no network round-trip.
//
// Scope: this is the first slice (always-visible bottom nav). Extending a
// page to use useT() means adding its keys here and swapping the JSX string
// for t('key.name') — the pattern, not the full string set, is what's
// established by this file. Translations below are standard/common renderings;
// flag any that read oddly to a native speaker for a follow-up pass.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppLanguage } from '@/lib/language';

export type UIStringKey =
  | 'nav.home'
  | 'nav.learn'
  | 'nav.novo'
  | 'nav.battle'
  | 'nav.profile';

export const UI_STRINGS: Record<AppLanguage, Record<UIStringKey, string>> = {
  en: {
    'nav.home':    'Home',
    'nav.learn':   'Learn',
    'nav.novo':    'Novo',
    'nav.battle':  'Battle',
    'nav.profile': 'Profile',
  },
  hi: {
    'nav.home':    'होम',
    'nav.learn':   'सीखें',
    'nav.novo':    'नोवो',
    'nav.battle':  'मुकाबला',
    'nav.profile': 'प्रोफ़ाइल',
  },
  ta: {
    'nav.home':    'முகப்பு',
    'nav.learn':   'கற்றல்',
    'nav.novo':    'நோவோ',
    'nav.battle':  'போட்டி',
    'nav.profile': 'சுயவிவரம்',
  },
  te: {
    'nav.home':    'హోమ్',
    'nav.learn':   'నేర్చుకోండి',
    'nav.novo':    'నోవో',
    'nav.battle':  'పోటీ',
    'nav.profile': 'ప్రొఫైల్',
  },
  kn: {
    'nav.home':    'ಮುಖಪುಟ',
    'nav.learn':   'ಕಲಿಯಿರಿ',
    'nav.novo':    'ನೋವೋ',
    'nav.battle':  'ಸ್ಪರ್ಧೆ',
    'nav.profile': 'ಪ್ರೊಫೈಲ್',
  },
  mr: {
    'nav.home':    'मुख्यपृष्ठ',
    'nav.learn':   'शिका',
    'nav.novo':    'नोवो',
    'nav.battle':  'लढत',
    'nav.profile': 'प्रोफाइल',
  },
  bn: {
    'nav.home':    'হোম',
    'nav.learn':   'শিখুন',
    'nav.novo':    'নোভো',
    'nav.battle':  'লড়াই',
    'nav.profile': 'প্রোফাইল',
  },
  gu: {
    'nav.home':    'હોમ',
    'nav.learn':   'શીખો',
    'nav.novo':    'નોવો',
    'nav.battle':  'સ્પર્ધા',
    'nav.profile': 'પ્રોફાઇલ',
  },
  pa: {
    'nav.home':    'ਹੋਮ',
    'nav.learn':   'ਸਿੱਖੋ',
    'nav.novo':    'ਨੋਵੋ',
    'nav.battle':  'ਮੁਕਾਬਲਾ',
    'nav.profile': 'ਪ੍ਰੋਫਾਈਲ',
  },
};
