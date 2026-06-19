// Multilingual support — inject user's preferred language into Gemini system prompts

export type AppLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'mr' | 'bn';

export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  kn: 'Kannada (ಕನ್ನಡ)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
};

export const LANGUAGE_NATIVE: Record<AppLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  mr: 'मराठी',
  bn: 'বাংলা',
};

export function getLangInstruction(lang: string | null | undefined): string {
  if (!lang || lang === 'en') return '';
  const name = LANGUAGE_NAMES[lang as AppLanguage];
  if (!name) return '';
  return `\n\nIMPORTANT: Respond in ${name}. All explanations, feedback, and conversational text must be in ${name}. Keep proper nouns, subject names, formulas, and technical terms in English.`;
}

export function isValidLanguage(lang: string): lang is AppLanguage {
  return lang in LANGUAGE_NAMES;
}
