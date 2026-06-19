export type FeatureCategory =
  | 'Study'
  | 'Battle'
  | 'Novo AI'
  | 'Analytics'
  | 'Social'
  | 'Tools'
  | 'Profile';

export interface Feature {
  label: string;
  desc: string;
  to: string;
  emoji: string;
  category: FeatureCategory;
  keywords?: string[];  // extra search terms beyond label+desc
}

export const FEATURE_REGISTRY: Feature[] = [
  // ── Novo AI ──────────────────────────────────────────────────────────────
  { label: 'Novo Chat',         desc: 'Ask your AI tutor anything, 24/7',              to: '/chat',              emoji: '🤖', category: 'Novo AI',   keywords: ['ai','tutor','question','help'] },
  { label: 'Novo Insights',     desc: 'Your weekly AI performance report',              to: '/novo-insights',     emoji: '✨', category: 'Novo AI',   keywords: ['report','weekly','performance'] },
  { label: 'Novo Reads',        desc: 'AI-curated articles for your exam',              to: '/novo-reads',        emoji: '📰', category: 'Novo AI',   keywords: ['articles','reading','curated'] },
  { label: 'Novo Challenges',   desc: 'Daily AI-set learning challenges',               to: '/novo-challenges',   emoji: '🎯', category: 'Novo AI',   keywords: ['challenge','daily','task'] },
  { label: 'Novo Live',         desc: 'Live interactive sessions with Novo',            to: '/novo-live',         emoji: '📡', category: 'Novo AI',   keywords: ['live','session','interactive'] },
  { label: 'Novo Proactive',    desc: 'Novo\'s unprompted study suggestions',           to: '/novo-messages',     emoji: '💬', category: 'Novo AI',   keywords: ['suggestions','messages','proactive'] },

  // ── Study ─────────────────────────────────────────────────────────────────
  { label: 'AI Quiz',           desc: 'Generate instant MCQs on any topic',             to: '/quiz',              emoji: '🧠', category: 'Study',     keywords: ['mcq','questions','test','quiz'] },
  { label: 'Flashcards',        desc: 'SM-2 spaced repetition review',                  to: '/flashcard',         emoji: '📇', category: 'Study',     keywords: ['flashcard','spaced','repetition','review','cards'] },
  { label: 'Sprint Session',    desc: '25-minute focused power sprint',                 to: '/sprint',            emoji: '⚡', category: 'Study',     keywords: ['sprint','focus','pomodoro','timer'] },
  { label: 'Daily Power Session',desc: '10-minute curated daily study',                 to: '/daily-session',     emoji: '☀️', category: 'Study',     keywords: ['daily','session','routine','habit'] },
  { label: 'NCERT Deep Dive',   desc: 'Every paragraph mapped with exam insights',      to: '/ncert-deep',        emoji: '📖', category: 'Study',     keywords: ['ncert','textbook','paragraph','chapter'] },
  { label: 'NCERT Chapters',    desc: 'Browse full NCERT chapter content',              to: '/ncert-chapters',    emoji: '📗', category: 'Study',     keywords: ['ncert','chapters','syllabus'] },
  { label: 'Formula Sheet',     desc: '80+ formulas with derivations & mnemonics',      to: '/formulas',          emoji: '🔢', category: 'Study',     keywords: ['formula','equations','derivation','maths','physics','chemistry'] },
  { label: 'Concept Map',       desc: 'Visual knowledge relationship graph',            to: '/concept-map',       emoji: '🗺️', category: 'Study',     keywords: ['concept','map','visual','graph','connections'] },
  { label: 'Study Plan',        desc: 'AI roadmap to your exam date',                   to: '/roadmap',           emoji: '📅', category: 'Study',     keywords: ['roadmap','plan','schedule','study plan'] },
  { label: 'Revision Planner',  desc: 'Week-by-week countdown plan',                   to: '/planner',           emoji: '📆', category: 'Study',     keywords: ['revision','planner','countdown','week'] },
  { label: 'Lesson Plan',       desc: 'AI-generated personalised lesson plan',          to: '/lesson-plan',       emoji: '📋', category: 'Study',     keywords: ['lesson','plan','personalised','curriculum'] },
  { label: 'Curriculum',        desc: 'Full syllabus browser',                          to: '/curriculum',        emoji: '📚', category: 'Study',     keywords: ['syllabus','curriculum','topics','chapters'] },
  { label: 'Solved Examples',   desc: '10,000+ step-by-step worked solutions',          to: '/solved',            emoji: '✅', category: 'Study',     keywords: ['solved','examples','solutions','step by step'] },
  { label: 'Mock Test',         desc: 'Full-length timed mock examination',             to: '/mock-test',         emoji: '📝', category: 'Study',     keywords: ['mock','test','exam','timed','full length'] },
  { label: 'Exam Simulator',    desc: 'Realistic exam environment simulation',          to: '/exam-simulator',    emoji: '💻', category: 'Study',     keywords: ['exam','simulator','realistic','environment'] },
  { label: 'PYQ Bank',          desc: 'Previous year questions & solutions',            to: '/pyq',               emoji: '🗂️', category: 'Study',     keywords: ['pyq','previous year','past papers','questions'] },
  { label: 'Concept Reels',     desc: '60-second TikTok-style concept videos',          to: '/reels',             emoji: '🎬', category: 'Study',     keywords: ['reels','video','short','tiktok','60 second'] },
  { label: 'Concept Videos',    desc: 'Full concept explanation videos',                to: '/concept-videos',    emoji: '🎥', category: 'Study',     keywords: ['video','explanation','lecture','concept'] },
  { label: 'Video Companion',   desc: 'Study alongside any educational video',          to: '/video-companion',   emoji: '📺', category: 'Study',     keywords: ['video','companion','youtube','watch'] },
  { label: 'Debate Mode',       desc: 'Argue both sides to master concepts',            to: '/debate',            emoji: '🎙️', category: 'Study',     keywords: ['debate','argue','discuss','both sides'] },
  { label: 'Story Mode',        desc: 'Learn through narrative scenarios',              to: '/story',             emoji: '📚', category: 'Study',     keywords: ['story','narrative','scenario','gamified'] },
  { label: 'Spaced Repetition', desc: 'View your SM-2 review schedule',                 to: '/spaced-review',     emoji: '🔄', category: 'Study',     keywords: ['spaced','repetition','sm-2','schedule'] },
  { label: 'Sleep Review',      desc: 'Revise key concepts before bed',                 to: '/sleep-review',      emoji: '😴', category: 'Study',     keywords: ['sleep','night','bedtime','review'] },
  { label: 'Peer Explanation',  desc: 'Teach a concept to reinforce learning',          to: '/peer-explanation',  emoji: '🗣️', category: 'Study',     keywords: ['teach','explain','peer','feynman'] },
  { label: 'Exam Prediction',   desc: 'AI-predicted likely exam questions',             to: '/exam-prediction',   emoji: '🔮', category: 'Study',     keywords: ['predict','prediction','likely','questions'] },
  { label: 'Exam War Room',     desc: 'Last-minute high-pressure exam prep',            to: '/exam-war-room',     emoji: '⚔️', category: 'Study',     keywords: ['war room','last minute','exam','intensive'] },
  { label: 'Regional Languages',desc: 'Study in Hindi + 6 Indian languages',            to: '/languages',         emoji: '🌐', category: 'Study',     keywords: ['hindi','regional','language','vernacular'] },
  { label: 'Sub. Dependency Map',desc: 'See topic prerequisites before you start',      to: '/subject-dependency',emoji: '🕸️', category: 'Study',     keywords: ['prerequisite','dependency','order','topics'] },
  { label: 'Speed Reader',      desc: 'Read NCERT passages at 300+ WPM',               to: '/ncert-deep',        emoji: '⚡', category: 'Study',     keywords: ['speed','read','wpm','fast','ncert'] },
  { label: 'Photo Solver',      desc: 'Snap a problem, get the full solution',          to: '/photo-solver',      emoji: '📸', category: 'Tools',     keywords: ['photo','camera','snap','solve','ocr'] },
  { label: 'AI Quiz Bank',      desc: 'Library of AI-generated quiz sets',              to: '/quiz-bank',         emoji: '🏦', category: 'Study',     keywords: ['quiz bank','saved','library','sets'] },

  // ── Battle ────────────────────────────────────────────────────────────────
  { label: 'Battle',            desc: '1v1 live quiz duels with peers',                 to: '/battle',            emoji: '⚔️', category: 'Battle',    keywords: ['battle','duel','1v1','compete','pvp'] },
  { label: 'Boss Fight',        desc: 'Epic multi-stage exam boss battles',             to: '/boss-fight',        emoji: '🐉', category: 'Battle',    keywords: ['boss','fight','epic','challenge','stages'] },
  { label: 'Tournament',        desc: 'Multi-round quiz tournament brackets',           to: '/tournament',        emoji: '🏆', category: 'Battle',    keywords: ['tournament','bracket','rounds','competition'] },
  { label: 'Streak Challenge',  desc: 'Compete on weekly streak challenges',            to: '/streak-challenge',  emoji: '🔥', category: 'Battle',    keywords: ['streak','challenge','weekly','competition'] },
  { label: 'Leaderboard',       desc: 'National XP rankings',                           to: '/leaderboard',       emoji: '📊', category: 'Battle',    keywords: ['leaderboard','rank','national','top'] },
  { label: 'School Leaderboard',desc: 'Rankings within your school',                   to: '/school-leaderboard',emoji: '🏫', category: 'Battle',    keywords: ['school','leaderboard','rank','local'] },
  { label: 'Mock Postmortem',   desc: 'Deep analysis of your mock test results',        to: '/mock-postmortem',   emoji: '🔬', category: 'Battle',    keywords: ['postmortem','analysis','mock','results'] },

  // ── Analytics ─────────────────────────────────────────────────────────────
  { label: 'Analytics Dashboard',desc: 'Full study analytics overview',                to: '/analytics',         emoji: '📈', category: 'Analytics', keywords: ['analytics','dashboard','stats','data'] },
  { label: 'Weakness Radar',    desc: 'Topic-by-topic weak point map',                  to: '/weakness-radar',    emoji: '📡', category: 'Analytics', keywords: ['weak','weakness','radar','topics'] },
  { label: 'Attention Heatmap', desc: 'See when your focus peaks each day',             to: '/attention-heatmap', emoji: '🔥', category: 'Analytics', keywords: ['attention','focus','heatmap','time','peak'] },
  { label: 'Error Patterns',    desc: 'Common mistakes you keep repeating',             to: '/error-patterns',    emoji: '❌', category: 'Analytics', keywords: ['error','mistakes','patterns','wrong'] },
  { label: 'Confidence Score',  desc: 'How confident you are per topic',                to: '/confidence',        emoji: '💪', category: 'Analytics', keywords: ['confidence','score','topic','sure'] },
  { label: 'Rank Predictor',    desc: 'AI-predicted exam rank from performance',        to: '/rank-predictor',    emoji: '🏅', category: 'Analytics', keywords: ['rank','predict','predictor','jee','neet'] },
  { label: 'Study DNA',         desc: 'Your unique learning style profile',             to: '/study-dna',         emoji: '🧬', category: 'Analytics', keywords: ['dna','learning style','profile','unique'] },
  { label: 'Learning Style',    desc: 'Discover how you learn best',                    to: '/learning-style',    emoji: '🧠', category: 'Analytics', keywords: ['learning style','visual','auditory','kinesthetic'] },
  { label: 'Achievement Feed',  desc: 'Live feed of earned achievements',               to: '/achievement-feed',  emoji: '🏅', category: 'Analytics', keywords: ['achievements','feed','milestones','badges'] },

  // ── Social ────────────────────────────────────────────────────────────────
  { label: 'Study Rooms',       desc: 'Collaborate with peers in live rooms',           to: '/study-rooms',       emoji: '👥', category: 'Social',    keywords: ['study room','live','collaborate','peers'] },
  { label: 'Study Groups',      desc: 'Join or create study circles',                   to: '/study-groups',      emoji: '🤝', category: 'Social',    keywords: ['group','circle','join','create'] },
  { label: 'Study Buddy',       desc: 'Find your perfect study partner',                to: '/study-buddy',       emoji: '🫂', category: 'Social',    keywords: ['buddy','partner','friend','match'] },
  { label: 'Friends',           desc: 'Connect and study with friends',                 to: '/friends',           emoji: '👫', category: 'Social',    keywords: ['friends','connect','social'] },
  { label: 'Doubt Room',        desc: 'Get community help on tough questions',          to: '/doubt-room',        emoji: '❓', category: 'Social',    keywords: ['doubt','help','question','community'] },
  { label: 'Live Events',       desc: 'Join live study sessions & webinars',            to: '/live-events',       emoji: '📡', category: 'Social',    keywords: ['live','event','webinar','session'] },
  { label: 'Group Study',       desc: 'Group detail and shared study sessions',         to: '/study-groups',      emoji: '📚', category: 'Social',    keywords: ['group','shared','session'] },

  // ── Tools ─────────────────────────────────────────────────────────────────
  { label: 'Whiteboard',        desc: 'Digital whiteboard for working problems',        to: '/whiteboard',        emoji: '✏️', category: 'Tools',     keywords: ['whiteboard','draw','sketch','solve'] },
  { label: 'Formula AR',        desc: 'Augmented reality formula viewer',               to: '/formula-ar',        emoji: '📱', category: 'Tools',     keywords: ['ar','augmented reality','formula','3d'] },
  { label: 'Scanner',           desc: 'Scan textbook pages to study',                   to: '/scanner',           emoji: '📷', category: 'Tools',     keywords: ['scan','camera','textbook','ocr'] },
  { label: 'Study Notes',       desc: 'Smart AI-powered note-taking',                   to: '/notes',             emoji: '📝', category: 'Tools',     keywords: ['notes','note taking','write','smart'] },
  { label: 'Mnemonic Generator',desc: 'Create memory aids for tough concepts',          to: '/mnemonic',          emoji: '🧩', category: 'Tools',     keywords: ['mnemonic','memory','aid','remember'] },
  { label: 'Mistake Journal',   desc: 'Track and learn from your errors',               to: '/mistake-journal',   emoji: '📔', category: 'Tools',     keywords: ['mistake','journal','track','learn','errors'] },
  { label: 'Study Pack',        desc: 'Download offline study packs',                   to: '/study-pack',        emoji: '📦', category: 'Tools',     keywords: ['pack','offline','download','bundle'] },
  { label: 'Browser',           desc: 'In-app web browser for research',                to: '/browser',           emoji: '🌐', category: 'Tools',     keywords: ['browser','web','search','internet'] },
  { label: 'Offline Mode',      desc: 'Study without internet connection',               to: '/offline',           emoji: '📴', category: 'Tools',     keywords: ['offline','download','no internet'] },

  // ── Profile ───────────────────────────────────────────────────────────────
  { label: 'Achievements',      desc: 'Your badges, trophies and milestones',           to: '/achievements',      emoji: '🏆', category: 'Profile',   keywords: ['achievements','badges','trophies','unlock'] },
  { label: 'Certifications',    desc: 'Earn official Edora certificates',               to: '/certifications',    emoji: '🎓', category: 'Profile',   keywords: ['certificates','certifications','earn','official'] },
  { label: 'Novo Pro',          desc: 'Unlock all premium features',                    to: '/pro',               emoji: '👑', category: 'Profile',   keywords: ['pro','premium','upgrade','subscription'] },
  { label: 'Study Reminders',   desc: 'Smart push notification schedule',               to: '/reminders',         emoji: '🔔', category: 'Profile',   keywords: ['reminder','notification','push','schedule'] },
  { label: 'Parent Portal',     desc: 'Progress reports for parents',                   to: '/parent',            emoji: '👨‍👩‍👦', category: 'Profile', keywords: ['parent','dashboard','progress','report'] },
  { label: 'Account Settings',  desc: 'Manage your account preferences',                to: '/account',           emoji: '⚙️', category: 'Profile',   keywords: ['account','settings','profile','preferences'] },
  { label: 'Teacher Export',    desc: 'Share progress reports with your teacher',       to: '/teacher-export',    emoji: '📊', category: 'Profile',   keywords: ['teacher','export','share','report'] },
  { label: 'Teacher Dashboard', desc: 'Teacher analytics and class view',               to: '/teacher-dashboard', emoji: '👩‍🏫', category: 'Profile', keywords: ['teacher','class','students','dashboard'] },
];

/** Simple fuzzy-ish search: checks label, desc, category, and keywords */
export function searchFeatures(query: string): Feature[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return FEATURE_REGISTRY.filter(f => {
    const haystack = [f.label, f.desc, f.category, ...(f.keywords ?? [])].join(' ').toLowerCase();
    // All words in query must appear somewhere
    return q.split(/\s+/).every(word => haystack.includes(word));
  }).slice(0, 20);
}

export const CATEGORY_ORDER: FeatureCategory[] = [
  'Novo AI', 'Study', 'Battle', 'Analytics', 'Social', 'Tools', 'Profile',
];

const RECENT_KEY = 'edora_cmd_recent';
const MAX_RECENT  = 6;

export function getRecentFeatures(): Feature[] {
  try {
    const raw: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return raw
      .map(to => FEATURE_REGISTRY.find(f => f.to === to))
      .filter((f): f is Feature => f !== undefined);
  } catch { return []; }
}

export function recordRecentFeature(to: string) {
  try {
    const raw: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    const next = [to, ...raw.filter(t => t !== to)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}
