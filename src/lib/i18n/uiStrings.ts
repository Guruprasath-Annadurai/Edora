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
  | 'learning.progress.quizzes_sub'
  // ToolsPage
  | 'tools.eyebrow'
  | 'tools.title'
  | 'tools.start_arrow'
  | 'tools.section.analytics'
  | 'tools.section.exam_prep'
  | 'tools.section.competitive'
  | 'tools.section.gamified'
  | 'tools.section.voice'
  | 'tools.section.novo_tutor'
  | 'tools.section.learning_paths'
  | 'tools.badge.new'
  | 'tools.badge.live'
  | 'tools.badge.double_xp'
  | 'tools.pdf_pack.title' | 'tools.pdf_pack.desc'
  | 'tools.exam_sim.title' | 'tools.exam_sim.desc'
  | 'tools.notes_scanner.title' | 'tools.notes_scanner.desc'
  | 'tools.mistake_journal.title' | 'tools.mistake_journal.desc'
  | 'tools.study_notes.title' | 'tools.study_notes.desc'
  | 'tools.mnemonic.title' | 'tools.mnemonic.desc'
  | 'tools.browser.title' | 'tools.browser.desc'
  | 'tools.novo_tutoring.title' | 'tools.novo_tutoring.desc'
  | 'tools.concept_map.title' | 'tools.concept_map.desc'
  | 'tools.error_patterns.title' | 'tools.error_patterns.desc'
  | 'tools.novo_live.title' | 'tools.novo_live.desc'
  | 'tools.whiteboard.title' | 'tools.whiteboard.desc'
  | 'tools.photo_solver.title' | 'tools.photo_solver.desc'
  | 'tools.novo_reads.title' | 'tools.novo_reads.desc'
  | 'tools.video_companion.title' | 'tools.video_companion.desc'
  | 'tools.curricula.title' | 'tools.curricula.desc'
  | 'tools.spaced_review.title' | 'tools.spaced_review.desc'
  | 'tools.learning_style.title' | 'tools.learning_style.desc'
  | 'tools.subject_map.title' | 'tools.subject_map.desc'
  | 'tools.exam_predictor.title' | 'tools.exam_predictor.desc'
  | 'tools.weakness_radar.title' | 'tools.weakness_radar.desc'
  | 'tools.attention_heatmap.title' | 'tools.attention_heatmap.desc'
  | 'tools.confidence_score.title' | 'tools.confidence_score.desc'
  | 'tools.parent_report.title' | 'tools.parent_report.desc'
  | 'tools.teacher_export.title' | 'tools.teacher_export.desc'
  | 'tools.mock_test.title' | 'tools.mock_test.desc'
  | 'tools.pyq_bank.title' | 'tools.pyq_bank.desc'
  | 'tools.ai_quiz_bank.title' | 'tools.ai_quiz_bank.desc'
  | 'tools.upsc_mains.title' | 'tools.upsc_mains.desc'
  | 'tools.ncert_chapters.title' | 'tools.ncert_chapters.desc'
  | 'tools.concept_videos.title' | 'tools.concept_videos.desc'
  | 'tools.leaderboard.title' | 'tools.leaderboard.desc'
  | 'tools.battle_1v1.title' | 'tools.battle_1v1.desc'
  | 'tools.study_circles.title' | 'tools.study_circles.desc'
  | 'tools.achievement_feed.title' | 'tools.achievement_feed.desc'
  | 'tools.friends.title' | 'tools.friends.desc'
  | 'tools.study_buddy.title' | 'tools.study_buddy.desc'
  | 'tools.live_events.title' | 'tools.live_events.desc'
  | 'tools.boss_challenge.title' | 'tools.boss_challenge.desc'
  | 'tools.tournament.title' | 'tools.tournament.desc'
  | 'tools.debate.title' | 'tools.debate.desc'
  | 'tools.story_mode.title' | 'tools.story_mode.desc'
  | 'tools.streak_challenges.title' | 'tools.streak_challenges.desc';

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
    'tools.eyebrow': 'Power Features',
    'tools.title': 'Study Tools',
    'tools.start_arrow': 'Start →',
    'tools.section.analytics': 'Analytics & Reporting',
    'tools.section.exam_prep': 'Exam Prep',
    'tools.section.competitive': 'Competitive & Social',
    'tools.section.gamified': 'Gamified & Social',
    'tools.section.voice': 'Voice & Multimodal',
    'tools.section.novo_tutor': 'Novo AI Tutor',
    'tools.section.learning_paths': 'Learning Paths',
    'tools.badge.new': 'NEW',
    'tools.badge.live': 'LIVE',
    'tools.badge.double_xp': '2× XP',
    'tools.pdf_pack.title': 'PDF Study Pack', 'tools.pdf_pack.desc': 'Upload any PDF → instant flashcards, quiz & summary',
    'tools.exam_sim.title': 'Exam Simulator', 'tools.exam_sim.desc': 'Timed mock tests with AI analysis',
    'tools.notes_scanner.title': 'Notes Scanner', 'tools.notes_scanner.desc': 'OCR handwriting to text',
    'tools.mistake_journal.title': 'Mistake Journal', 'tools.mistake_journal.desc': 'Track & fix your errors',
    'tools.study_notes.title': 'Study Notes', 'tools.study_notes.desc': 'Organize your notes',
    'tools.mnemonic.title': 'Mnemonic AI', 'tools.mnemonic.desc': 'AI memory tricks',
    'tools.browser.title': 'Browser', 'tools.browser.desc': 'Research & references',
    'tools.novo_tutoring.title': 'Novo Tutoring', 'tools.novo_tutoring.desc': 'Structured 1-on-1 sessions with Socratic mode',
    'tools.concept_map.title': 'Concept Map', 'tools.concept_map.desc': 'Live knowledge graph coloured by mastery',
    'tools.error_patterns.title': 'Error Patterns', 'tools.error_patterns.desc': 'Detect & drill your recurring mistakes',
    'tools.novo_live.title': 'Novo Live', 'tools.novo_live.desc': 'Full voice lesson — Novo teaches & quizzes you',
    'tools.whiteboard.title': 'Whiteboard', 'tools.whiteboard.desc': 'Draw equations — Novo spots errors',
    'tools.photo_solver.title': 'Photo Solver', 'tools.photo_solver.desc': 'Snap a problem — get step-by-step solution',
    'tools.novo_reads.title': 'Novo Reads', 'tools.novo_reads.desc': 'Paste text — Novo explains as you read',
    'tools.video_companion.title': 'Video Companion', 'tools.video_companion.desc': 'YouTube lecture → summary & flashcards',
    'tools.curricula.title': 'Curricula', 'tools.curricula.desc': '80+ exam boards worldwide — enroll & track',
    'tools.spaced_review.title': 'Spaced Review', 'tools.spaced_review.desc': 'SM-2 flashcard review queue',
    'tools.learning_style.title': 'My Learning Style', 'tools.learning_style.desc': 'How Novo adapts to you',
    'tools.subject_map.title': 'Subject Map', 'tools.subject_map.desc': 'Knowledge unlock dependency graph',
    'tools.exam_predictor.title': 'Exam Score Predictor', 'tools.exam_predictor.desc': 'AI projects your likely grade + daily study plan',
    'tools.weakness_radar.title': 'Weakness Radar', 'tools.weakness_radar.desc': 'Spider chart · JEE topic weights',
    'tools.attention_heatmap.title': 'Attention Heatmap', 'tools.attention_heatmap.desc': "Topics you've been avoiding",
    'tools.confidence_score.title': 'Confidence Score', 'tools.confidence_score.desc': 'Speed × accuracy analysis',
    'tools.parent_report.title': 'Parent Report', 'tools.parent_report.desc': 'Weekly AI summary for parents',
    'tools.teacher_export.title': 'Teacher Export', 'tools.teacher_export.desc': 'Full mastery report PDF',
    'tools.mock_test.title': 'Mock Full Test', 'tools.mock_test.desc': '3hr JEE / 3.5hr NEET timed simulation · auto-score + percentile',
    'tools.pyq_bank.title': 'PYQ Bank', 'tools.pyq_bank.desc': '10yr JEE·NEET·CBSE archive',
    'tools.ai_quiz_bank.title': 'AI Quiz Bank', 'tools.ai_quiz_bank.desc': 'Infinite adaptive questions',
    'tools.upsc_mains.title': 'Mains & Long-Answer', 'tools.upsc_mains.desc': 'UPSC Essay/GS · CBSE Boards · AI feedback',
    'tools.ncert_chapters.title': 'NCERT Chapters', 'tools.ncert_chapters.desc': 'Class 6–12 · 20 MCQs + flashcards',
    'tools.concept_videos.title': 'Concept Videos', 'tools.concept_videos.desc': '60-sec explainers for hard topics',
    'tools.leaderboard.title': 'Leaderboard', 'tools.leaderboard.desc': 'Global · State · City · School · Friends rankings',
    'tools.battle_1v1.title': '1v1 Battle', 'tools.battle_1v1.desc': 'Real-time quiz duel',
    'tools.study_circles.title': 'Study Circles', 'tools.study_circles.desc': 'Sync sprints · group streak',
    'tools.achievement_feed.title': 'Achievement Feed', 'tools.achievement_feed.desc': 'Cheer your peers',
    'tools.friends.title': 'Friends', 'tools.friends.desc': 'Add, find, nudge friends',
    'tools.study_buddy.title': 'Study Buddy', 'tools.study_buddy.desc': 'AI-paired accountability partner',
    'tools.live_events.title': 'Live Events', 'tools.live_events.desc': 'National synchronized quiz',
    'tools.boss_challenge.title': 'Daily Boss Challenge', 'tools.boss_challenge.desc': 'Hardest problem of the day · 2× XP · timed',
    'tools.tournament.title': 'Tournament', 'tools.tournament.desc': 'Weekly ranked quiz',
    'tools.debate.title': 'Debate Mode', 'tools.debate.desc': 'Argue vs Novo',
    'tools.story_mode.title': 'Story Mode', 'tools.story_mode.desc': 'Learn through adventure',
    'tools.streak_challenges.title': 'Streak Challenges', 'tools.streak_challenges.desc': '7-day focus sprints',
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
    'tools.eyebrow': 'पावर फीचर्स',
    'tools.title': 'स्टडी टूल्स',
    'tools.start_arrow': 'शुरू करें →',
    'tools.section.analytics': 'एनालिटिक्स और रिपोर्ट',
    'tools.section.exam_prep': 'परीक्षा की तैयारी',
    'tools.section.competitive': 'प्रतिस्पर्धा और सोशल',
    'tools.section.gamified': 'गेमिफाइड और सोशल',
    'tools.section.voice': 'वॉइस और मल्टीमोडल',
    'tools.section.novo_tutor': 'नोवो AI ट्यूटर',
    'tools.section.learning_paths': 'लर्निंग पाथ्स',
    'tools.badge.new': 'नया',
    'tools.badge.live': 'लाइव',
    'tools.badge.double_xp': '2× XP',
    'tools.pdf_pack.title': 'PDF स्टडी पैक', 'tools.pdf_pack.desc': 'कोई भी PDF अपलोड करें → तुरंत फ्लैशकार्ड, क्विज़ और सारांश',
    'tools.exam_sim.title': 'एग्ज़ाम सिम्युलेटर', 'tools.exam_sim.desc': 'AI विश्लेषण के साथ टाइम्ड मॉक टेस्ट',
    'tools.notes_scanner.title': 'नोट्स स्कैनर', 'tools.notes_scanner.desc': 'हस्तलिखित नोट्स को टेक्स्ट में बदलें',
    'tools.mistake_journal.title': 'मिस्टेक जर्नल', 'tools.mistake_journal.desc': 'अपनी गलतियां ट्रैक करें और सुधारें',
    'tools.study_notes.title': 'स्टडी नोट्स', 'tools.study_notes.desc': 'अपने नोट्स व्यवस्थित करें',
    'tools.mnemonic.title': 'निमोनिक AI', 'tools.mnemonic.desc': 'याद रखने की AI ट्रिक्स',
    'tools.browser.title': 'ब्राउज़र', 'tools.browser.desc': 'रिसर्च और संदर्भ सामग्री',
    'tools.novo_tutoring.title': 'नोवो ट्यूटरिंग', 'tools.novo_tutoring.desc': 'सुकराती तरीके से संरचित 1-पर-1 सेशन',
    'tools.concept_map.title': 'कॉन्सेप्ट मैप', 'tools.concept_map.desc': 'महारत के अनुसार रंगीन नॉलेज ग्राफ',
    'tools.error_patterns.title': 'एरर पैटर्न', 'tools.error_patterns.desc': 'बार-बार होने वाली गलतियां पहचानें और सुधारें',
    'tools.novo_live.title': 'नोवो लाइव', 'tools.novo_live.desc': 'पूरा वॉइस लेसन — नोवो सिखाता और क्विज़ लेता है',
    'tools.whiteboard.title': 'व्हाइटबोर्ड', 'tools.whiteboard.desc': 'समीकरण बनाएं — नोवो गलतियां पकड़ता है',
    'tools.photo_solver.title': 'फोटो सॉल्वर', 'tools.photo_solver.desc': 'प्रश्न की फोटो लें — स्टेप-बाय-स्टेप हल पाएं',
    'tools.novo_reads.title': 'नोवो रीड्स', 'tools.novo_reads.desc': 'टेक्स्ट पेस्ट करें — नोवो पढ़ते हुए समझाता है',
    'tools.video_companion.title': 'वीडियो कम्पैनियन', 'tools.video_companion.desc': 'YouTube लेक्चर → सारांश और फ्लैशकार्ड',
    'tools.curricula.title': 'करिकुला', 'tools.curricula.desc': 'दुनिया भर के 80+ एग्ज़ाम बोर्ड — एनरोल करें और ट्रैक करें',
    'tools.spaced_review.title': 'स्पेस्ड रिव्यू', 'tools.spaced_review.desc': 'SM-2 फ्लैशकार्ड रिव्यू क्यू',
    'tools.learning_style.title': 'मेरी लर्निंग स्टाइल', 'tools.learning_style.desc': 'नोवो आपके लिए कैसे ढलता है',
    'tools.subject_map.title': 'सब्जेक्ट मैप', 'tools.subject_map.desc': 'नॉलेज अनलॉक डिपेंडेंसी ग्राफ',
    'tools.exam_predictor.title': 'एग्ज़ाम स्कोर प्रेडिक्टर', 'tools.exam_predictor.desc': 'AI आपका संभावित ग्रेड + डेली स्टडी प्लान बताता है',
    'tools.weakness_radar.title': 'वीकनेस रडार', 'tools.weakness_radar.desc': 'स्पाइडर चार्ट · JEE टॉपिक वेटेज',
    'tools.attention_heatmap.title': 'अटेंशन हीटमैप', 'tools.attention_heatmap.desc': 'जिन टॉपिक्स से आप बच रहे हैं',
    'tools.confidence_score.title': 'कॉन्फिडेंस स्कोर', 'tools.confidence_score.desc': 'स्पीड × सटीकता विश्लेषण',
    'tools.parent_report.title': 'पेरेंट रिपोर्ट', 'tools.parent_report.desc': 'माता-पिता के लिए साप्ताहिक AI सारांश',
    'tools.teacher_export.title': 'टीचर एक्सपोर्ट', 'tools.teacher_export.desc': 'पूरी महारत रिपोर्ट PDF',
    'tools.mock_test.title': 'मॉक फुल टेस्ट', 'tools.mock_test.desc': '3 घंटे JEE / 3.5 घंटे NEET टाइम्ड सिमुलेशन · ऑटो-स्कोर + पर्सेंटाइल',
    'tools.pyq_bank.title': 'PYQ बैंक', 'tools.pyq_bank.desc': '10 साल का JEE·NEET·CBSE आर्काइव',
    'tools.ai_quiz_bank.title': 'AI क्विज़ बैंक', 'tools.ai_quiz_bank.desc': 'असीमित एडैप्टिव प्रश्न',
    'tools.upsc_mains.title': 'मेन्स और लॉन्ग-आंसर', 'tools.upsc_mains.desc': 'UPSC निबंध/GS · CBSE बोर्ड्स · AI फीडबैक',
    'tools.ncert_chapters.title': 'NCERT अध्याय', 'tools.ncert_chapters.desc': 'कक्षा 6–12 · 20 MCQ + फ्लैशकार्ड',
    'tools.concept_videos.title': 'कॉन्सेप्ट वीडियो', 'tools.concept_videos.desc': 'कठिन टॉपिक्स के लिए 60-सेकंड वीडियो',
    'tools.leaderboard.title': 'लीडरबोर्ड', 'tools.leaderboard.desc': 'ग्लोबल · राज्य · शहर · स्कूल · दोस्तों की रैंकिंग',
    'tools.battle_1v1.title': '1v1 बैटल', 'tools.battle_1v1.desc': 'रीयल-टाइम क्विज़ मुकाबला',
    'tools.study_circles.title': 'स्टडी सर्कल्स', 'tools.study_circles.desc': 'सिंक स्प्रिंट · ग्रुप स्ट्रीक',
    'tools.achievement_feed.title': 'अचीवमेंट फीड', 'tools.achievement_feed.desc': 'अपने साथियों का हौसला बढ़ाएं',
    'tools.friends.title': 'दोस्त', 'tools.friends.desc': 'दोस्त जोड़ें, खोजें, याद दिलाएं',
    'tools.study_buddy.title': 'स्टडी बडी', 'tools.study_buddy.desc': 'AI-जोड़ा जवाबदेही पार्टनर',
    'tools.live_events.title': 'लाइव इवेंट्स', 'tools.live_events.desc': 'राष्ट्रीय स्तर पर एक साथ क्विज़',
    'tools.boss_challenge.title': 'डेली बॉस चैलेंज', 'tools.boss_challenge.desc': 'दिन का सबसे कठिन सवाल · 2× XP · टाइम्ड',
    'tools.tournament.title': 'टूर्नामेंट', 'tools.tournament.desc': 'साप्ताहिक रैंक्ड क्विज़',
    'tools.debate.title': 'डिबेट मोड', 'tools.debate.desc': 'नोवो से बहस करें',
    'tools.story_mode.title': 'स्टोरी मोड', 'tools.story_mode.desc': 'एडवेंचर के ज़रिए सीखें',
    'tools.streak_challenges.title': 'स्ट्रीक चैलेंज', 'tools.streak_challenges.desc': '7-दिन का फोकस स्प्रिंट',
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
