// ─────────────────────────────────────────────────────────────────────────────
// UI chrome translations — nav labels, buttons, page titles.
//
// Deliberately separate from the AI-content translation paths (novo-language,
// RegionalLanguagePage's question translation, getLangInstruction() for
// Gemini system prompts) — this dictionary is for static UI strings that
// never touch an LLM, so they render instantly with no network round-trip.
//
// Scope/rollout: `en` must have every key (it's the fallback for everything).
// Other locales are intentionally Partial — a key with no Hindi/Tamil/etc.
// translation yet just falls back to English (see useT()) rather than
// blocking a page's conversion on having all 8 languages ready. Full-app
// conversion is being done in batches: pages get their strings extracted and
// wired to useT() first (so the app is translation-ready everywhere), with
// Hindi filled in as the first non-English language since it covers the
// largest user base — Tamil/Telugu/Kannada/Marathi/Bengali/Gujarati/Punjabi
// are a follow-up pass. None of the translations below have been reviewed
// by a native speaker yet; treat them as a solid first draft, not final copy.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppLanguage } from '@/lib/language';

export type UIStringKey =
  | 'nav.home'
  | 'nav.learn'
  | 'nav.novo'
  | 'nav.battle'
  | 'nav.profile'
  // LearningPage
  | 'learning.eyebrow'
  | 'learning.title'
  | 'learning.search_aria'
  | 'learning.tab.tools'
  | 'learning.tab.progress'
  | 'learning.my_courses.title'
  | 'learning.my_courses.badge_new'
  | 'learning.my_courses.subtitle'
  | 'learning.section.flashcards.title'
  | 'learning.section.flashcards.desc'
  | 'learning.section.quiz.title'
  | 'learning.section.quiz.desc'
  | 'learning.section.concept_map.title'
  | 'learning.section.concept_map.desc'
  | 'learning.section.study_plan.title'
  | 'learning.section.study_plan.desc'
  | 'learning.section.study_rooms.title'
  | 'learning.section.study_rooms.desc'
  | 'learning.due_prefix'
  | 'learning.activity.reviewed_suffix'
  | 'learning.activity.this_week_suffix'
  | 'learning.content_moat.heading'
  | 'learning.content_moat.ncert.title'
  | 'learning.content_moat.ncert.desc'
  | 'learning.content_moat.formulas.title'
  | 'learning.content_moat.formulas.desc'
  | 'learning.content_moat.planner.title'
  | 'learning.content_moat.planner.desc'
  | 'learning.content_moat.reels.title'
  | 'learning.content_moat.reels.desc'
  | 'learning.content_moat.solved.title'
  | 'learning.content_moat.solved.desc'
  | 'learning.content_moat.languages.title'
  | 'learning.content_moat.languages.desc'
  | 'learning.progress.subject_progress'
  | 'learning.progress.no_flashcards'
  | 'learning.progress.weekly_summary'
  | 'learning.progress.sprints'
  | 'learning.progress.sprints_sub'
  | 'learning.progress.cards'
  | 'learning.progress.cards_sub'
  | 'learning.progress.quizzes'
  | 'learning.progress.quizzes_sub';

type UIStringTable = Record<UIStringKey, string>;

export const UI_STRINGS: { en: UIStringTable } & Record<Exclude<AppLanguage, 'en'>, Partial<UIStringTable>> = {
  en: {
    'nav.home':    'Home',
    'nav.learn':   'Learn',
    'nav.novo':    'Novo',
    'nav.battle':  'Battle',
    'nav.profile': 'Profile',
    'learning.eyebrow': 'Your Courses',
    'learning.title': 'Learning Hub',
    'learning.search_aria': 'Search features',
    'learning.tab.tools': 'Study Tools',
    'learning.tab.progress': 'My Progress',
    'learning.my_courses.title': 'My Courses',
    'learning.my_courses.badge_new': 'NEW',
    'learning.my_courses.subtitle': 'NCERT Classes 9–12 · Chapter-by-chapter',
    'learning.section.flashcards.title': 'Flashcards',
    'learning.section.flashcards.desc': 'SM-2 spaced repetition review',
    'learning.section.quiz.title': 'AI Quiz',
    'learning.section.quiz.desc': 'Generate MCQs on any topic',
    'learning.section.concept_map.title': 'Knowledge Map',
    'learning.section.concept_map.desc': 'Visual concept relationships',
    'learning.section.study_plan.title': 'Study Plan',
    'learning.section.study_plan.desc': 'AI roadmap to your exam',
    'learning.section.study_rooms.title': 'Study Rooms',
    'learning.section.study_rooms.desc': 'Collaborate with peers',
    'learning.due_prefix': 'Due',
    'learning.activity.reviewed_suffix': 'reviewed',
    'learning.activity.this_week_suffix': 'this week',
    'learning.content_moat.heading': 'Content Moat',
    'learning.content_moat.ncert.title': 'NCERT Deep Dive',
    'learning.content_moat.ncert.desc': 'Every paragraph mapped with exam insights',
    'learning.content_moat.formulas.title': 'Formula Sheet',
    'learning.content_moat.formulas.desc': '80+ formulas with derivations & mnemonics',
    'learning.content_moat.planner.title': 'Revision Planner',
    'learning.content_moat.planner.desc': 'Countdown-aware week-by-week study plan',
    'learning.content_moat.reels.title': 'Concept Reels',
    'learning.content_moat.reels.desc': '60-second TikTok-style concept videos',
    'learning.content_moat.solved.title': 'Solved Examples',
    'learning.content_moat.solved.desc': '10,000+ step-by-step worked solutions',
    'learning.content_moat.languages.title': 'Regional Languages',
    'learning.content_moat.languages.desc': 'Questions in Hindi + 6 Indian languages',
    'learning.progress.subject_progress': 'Subject Progress',
    'learning.progress.no_flashcards': 'No flashcards yet — add some to see progress.',
    'learning.progress.weekly_summary': 'Weekly Summary',
    'learning.progress.sprints': 'Sprints',
    'learning.progress.sprints_sub': 'this week',
    'learning.progress.cards': 'Cards',
    'learning.progress.cards_sub': 'reviewed',
    'learning.progress.quizzes': 'Quizzes',
    'learning.progress.quizzes_sub': 'completed',
  },
  hi: {
    'nav.home':    'होम',
    'nav.learn':   'सीखें',
    'nav.novo':    'नोवो',
    'nav.battle':  'मुकाबला',
    'nav.profile': 'प्रोफ़ाइल',
    'learning.eyebrow': 'आपके कोर्स',
    'learning.title': 'लर्निंग हब',
    'learning.search_aria': 'सुविधाएं खोजें',
    'learning.tab.tools': 'स्टडी टूल्स',
    'learning.tab.progress': 'मेरी प्रगति',
    'learning.my_courses.title': 'मेरे कोर्स',
    'learning.my_courses.badge_new': 'नया',
    'learning.my_courses.subtitle': 'NCERT कक्षा 9–12 · अध्याय दर अध्याय',
    'learning.section.flashcards.title': 'फ्लैशकार्ड',
    'learning.section.flashcards.desc': 'SM-2 स्पेस्ड रिपिटीशन रिवीजन',
    'learning.section.quiz.title': 'AI क्विज़',
    'learning.section.quiz.desc': 'किसी भी विषय पर प्रश्न बनाएं',
    'learning.section.concept_map.title': 'नॉलेज मैप',
    'learning.section.concept_map.desc': 'कॉन्सेप्ट के बीच का संबंध देखें',
    'learning.section.study_plan.title': 'स्टडी प्लान',
    'learning.section.study_plan.desc': 'आपकी परीक्षा के लिए AI रोडमैप',
    'learning.section.study_rooms.title': 'स्टडी रूम्स',
    'learning.section.study_rooms.desc': 'साथियों के साथ मिलकर पढ़ें',
    'learning.due_prefix': 'ड्यू',
    'learning.activity.reviewed_suffix': 'रिवाइज़ किए',
    'learning.activity.this_week_suffix': 'इस हफ्ते',
    'learning.content_moat.heading': 'खास सामग्री',
    'learning.content_moat.ncert.title': 'NCERT डीप डाइव',
    'learning.content_moat.ncert.desc': 'हर पैराग्राफ परीक्षा के लिहाज़ से समझाया गया',
    'learning.content_moat.formulas.title': 'फॉर्मूला शीट',
    'learning.content_moat.formulas.desc': '80+ फॉर्मूले, व्युत्पत्ति और याद रखने के तरीकों के साथ',
    'learning.content_moat.planner.title': 'रिवीजन प्लानर',
    'learning.content_moat.planner.desc': 'परीक्षा की उलटी गिनती के हिसाब से साप्ताहिक योजना',
    'learning.content_moat.reels.title': 'कॉन्सेप्ट रील्स',
    'learning.content_moat.reels.desc': '60 सेकंड के छोटे वीडियो में कॉन्सेप्ट',
    'learning.content_moat.solved.title': 'हल किए गए उदाहरण',
    'learning.content_moat.solved.desc': '10,000+ स्टेप-बाय-स्टेप हल',
    'learning.content_moat.languages.title': 'क्षेत्रीय भाषाएं',
    'learning.content_moat.languages.desc': 'हिंदी सहित 6 भारतीय भाषाओं में प्रश्न',
    'learning.progress.subject_progress': 'विषयवार प्रगति',
    'learning.progress.no_flashcards': 'अभी कोई फ्लैशकार्ड नहीं — प्रगति देखने के लिए कुछ जोड़ें।',
    'learning.progress.weekly_summary': 'साप्ताहिक सारांश',
    'learning.progress.sprints': 'स्प्रिंट',
    'learning.progress.sprints_sub': 'इस हफ्ते',
    'learning.progress.cards': 'कार्ड्स',
    'learning.progress.cards_sub': 'रिवाइज़ किए',
    'learning.progress.quizzes': 'क्विज़',
    'learning.progress.quizzes_sub': 'पूरे किए',
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
