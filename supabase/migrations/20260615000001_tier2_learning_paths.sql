-- =============================================================================
-- Tier 2 — Personalised Learning Paths
-- Features: Curriculum Builder, Prerequisite Detector, Learning Style Profiler,
--           Spaced Repetition (SM-2), Subject Dependency Graph
-- =============================================================================

-- ── Helper: updated_at trigger (reuse if exists) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =============================================================================
-- 1. EXAM BOARDS (global reference table — shared, no RLS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exam_boards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,          -- e.g. 'GCSE_AQA', 'IB_DP', 'JEE_ADV'
  name        TEXT NOT NULL,                 -- full human name
  country     TEXT NOT NULL,                 -- ISO 3166-1 alpha-2 or region label
  region      TEXT NOT NULL,                 -- 'UK','India','USA','International',…
  level       TEXT NOT NULL,                 -- 'Secondary','Pre-University','University','Professional'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: ~80 real exam boards world-wide
INSERT INTO public.exam_boards (code, name, country, region, level, description) VALUES
-- ── United Kingdom ────────────────────────────────────────────────────────────
('GCSE_AQA',       'GCSE — AQA',                            'GB', 'UK', 'Secondary',      'Assessment and Qualifications Alliance GCSE'),
('GCSE_EDEXCEL',   'GCSE — Edexcel (Pearson)',               'GB', 'UK', 'Secondary',      'Pearson Edexcel GCSE'),
('GCSE_OCR',       'GCSE — OCR',                            'GB', 'UK', 'Secondary',      'Oxford Cambridge RSA GCSE'),
('GCSE_WJEC',      'GCSE — WJEC / Eduqas',                  'GB', 'UK', 'Secondary',      'Welsh Joint Education Committee GCSE'),
('ALEVEL_AQA',     'A-Level — AQA',                         'GB', 'UK', 'Pre-University', 'AQA A-Level (England)'),
('ALEVEL_EDEXCEL', 'A-Level — Edexcel',                     'GB', 'UK', 'Pre-University', 'Pearson Edexcel A-Level'),
('ALEVEL_OCR',     'A-Level — OCR',                         'GB', 'UK', 'Pre-University', 'OCR A-Level'),
('ALEVEL_WJEC',    'A-Level — WJEC',                        'GB', 'UK', 'Pre-University', 'WJEC A-Level (Wales)'),
('SCOTTISH_N5',    'Scottish National 5',                   'GB', 'UK', 'Secondary',      'SQA National 5 (Scotland)'),
('SCOTTISH_HIGHER','Scottish Higher',                        'GB', 'UK', 'Pre-University', 'SQA Higher (Scotland)'),
('SCOTTISH_AH',    'Scottish Advanced Higher',               'GB', 'UK', 'Pre-University', 'SQA Advanced Higher (Scotland)'),

-- ── International Baccalaureate ───────────────────────────────────────────────
('IB_PYP',         'IB Primary Years Programme',            'CH', 'International', 'Primary',        'IB PYP (ages 3–12)'),
('IB_MYP',         'IB Middle Years Programme',             'CH', 'International', 'Secondary',      'IB MYP (ages 11–16)'),
('IB_DP',          'IB Diploma Programme',                  'CH', 'International', 'Pre-University', 'IB DP (ages 16–19)'),
('IB_CP',          'IB Career-related Programme',           'CH', 'International', 'Pre-University', 'IB CP (vocational)'),

-- ── Cambridge International ───────────────────────────────────────────────────
('CAM_IGCSE',      'Cambridge IGCSE',                       'GB', 'International', 'Secondary',      'Cambridge Lower Secondary & IGCSE'),
('CAM_OLEVEL',     'Cambridge O Level',                     'GB', 'International', 'Secondary',      'Cambridge O Level'),
('CAM_ALEVEL',     'Cambridge International A Level',       'GB', 'International', 'Pre-University', 'Cambridge International AS & A Level'),

-- ── India ────────────────────────────────────────────────────────────────────
('CBSE_10',        'CBSE — Class 10 (Board)',                'IN', 'India', 'Secondary',      'Central Board of Secondary Education Class 10'),
('CBSE_12',        'CBSE — Class 12 (Board)',                'IN', 'India', 'Pre-University', 'Central Board of Secondary Education Class 12'),
('ICSE_10',        'ICSE — Class 10',                       'IN', 'India', 'Secondary',      'Indian Certificate of Secondary Education'),
('ISC_12',         'ISC — Class 12',                        'IN', 'India', 'Pre-University', 'Indian School Certificate Class 12'),
('JEE_MAIN',       'JEE Main',                              'IN', 'India', 'University',     'Joint Entrance Examination — Main (NTA)'),
('JEE_ADV',        'JEE Advanced',                          'IN', 'India', 'University',     'Joint Entrance Examination — Advanced (IITs)'),
('NEET_UG',        'NEET-UG',                               'IN', 'India', 'University',     'National Eligibility cum Entrance Test (Medicine)'),
('UPSC_CSE',       'UPSC Civil Services',                   'IN', 'India', 'Professional',   'UPSC Civil Services Exam (IAS/IPS/IFS)'),
('CAT_MBA',        'CAT — MBA Entrance',                    'IN', 'India', 'University',     'Common Admission Test (IIMs)'),
('GATE',           'GATE',                                  'IN', 'India', 'University',     'Graduate Aptitude Test in Engineering'),

-- ── USA ──────────────────────────────────────────────────────────────────────
('SAT',            'SAT',                                   'US', 'USA', 'Pre-University', 'College Board SAT'),
('ACT',            'ACT',                                   'US', 'USA', 'Pre-University', 'ACT College Readiness'),
('AP',             'AP (Advanced Placement)',                'US', 'USA', 'Pre-University', 'College Board AP Courses'),
('PSAT',           'PSAT / NMSQT',                          'US', 'USA', 'Secondary',      'Preliminary SAT & National Merit'),
('GRE',            'GRE',                                   'US', 'USA', 'University',     'Graduate Record Examinations (ETS)'),
('GMAT',           'GMAT',                                  'US', 'USA', 'Professional',   'Graduate Management Admission Test'),
('LSAT',           'LSAT',                                  'US', 'USA', 'Professional',   'Law School Admission Test'),
('MCAT',           'MCAT',                                  'US', 'USA', 'Professional',   'Medical College Admission Test'),
('USMLE_1',        'USMLE Step 1',                          'US', 'USA', 'Professional',   'US Medical Licensing Exam Step 1'),

-- ── Australia ────────────────────────────────────────────────────────────────
('HSC_NSW',        'HSC — New South Wales',                 'AU', 'Australia', 'Pre-University', 'Higher School Certificate NSW'),
('VCE',            'VCE — Victoria',                        'AU', 'Australia', 'Pre-University', 'Victorian Certificate of Education'),
('QCE',            'QCE — Queensland',                      'AU', 'Australia', 'Pre-University', 'Queensland Certificate of Education'),
('SACE',           'SACE — South Australia',                'AU', 'Australia', 'Pre-University', 'South Australian Certificate of Education'),
('WACE',           'WACE — Western Australia',              'AU', 'Australia', 'Pre-University', 'Western Australian Certificate of Education'),
('NAPLAN',         'NAPLAN',                                'AU', 'Australia', 'Secondary',      'National Assessment Program — Literacy and Numeracy'),

-- ── Canada ───────────────────────────────────────────────────────────────────
('OSSD',           'OSSD — Ontario',                        'CA', 'Canada', 'Pre-University', 'Ontario Secondary School Diploma'),
('BC_DOGWOOD',     'BC Dogwood Diploma',                    'CA', 'Canada', 'Pre-University', 'British Columbia Graduation Program'),
('AB_DIPLOMA',     'Alberta Diploma',                       'CA', 'Canada', 'Pre-University', 'Alberta High School Diploma Exams'),
('CEGEP',          'CÉGEP — Quebec',                        'CA', 'Canada', 'Pre-University', 'Collège d''enseignement général et professionnel'),

-- ── Singapore ────────────────────────────────────────────────────────────────
('SG_OLEVEL',      'Singapore O Level',                     'SG', 'Asia-Pacific', 'Secondary',      'Singapore-Cambridge O Level'),
('SG_ALEVEL',      'Singapore A Level / H2',                'SG', 'Asia-Pacific', 'Pre-University', 'Singapore-Cambridge A Level'),
('SG_PSLE',        'Singapore PSLE',                        'SG', 'Asia-Pacific', 'Primary',        'Primary School Leaving Exam'),

-- ── Hong Kong ────────────────────────────────────────────────────────────────
('HK_DSE',         'Hong Kong DSE',                         'HK', 'Asia-Pacific', 'Pre-University', 'Hong Kong Diploma of Secondary Education'),

-- ── China ────────────────────────────────────────────────────────────────────
('GAOKAO',         'Gaokao',                                'CN', 'Asia-Pacific', 'University',     'National College Entrance Examination (China)'),

-- ── South Korea ──────────────────────────────────────────────────────────────
('SUNEUNG',        'CSAT (Suneung)',                         'KR', 'Asia-Pacific', 'University',     'College Scholastic Ability Test — South Korea'),

-- ── Japan ────────────────────────────────────────────────────────────────────
('JAPAN_KYOTSU',   'Daigaku Nyushi Kyotsu Test',            'JP', 'Asia-Pacific', 'University',     'Japan Common University Entrance Test'),

-- ── Europe ───────────────────────────────────────────────────────────────────
('FR_BACCALAUREAT','French Baccalauréat',                   'FR', 'Europe', 'Pre-University', 'Baccalauréat général / technologique / professionnel'),
('DE_ABITUR',      'German Abitur',                         'DE', 'Europe', 'Pre-University', 'Allgemeine Hochschulreife (Germany)'),
('IT_MATURITA',    'Italian Maturità',                      'IT', 'Europe', 'Pre-University', 'Esame di Stato (Italy)'),
('ES_EVAU',        'Spanish EVAU / EBAU',                   'ES', 'Europe', 'Pre-University', 'Evaluación de Bachillerato para el Acceso a la Universidad'),
('NL_VWO',         'Dutch VWO',                             'NL', 'Europe', 'Pre-University', 'Voorbereidend wetenschappelijk onderwijs'),
('PL_MATURA',      'Polish Matura',                         'PL', 'Europe', 'Pre-University', 'Egzamin maturalny (Poland)'),

-- ── Middle East & Africa ─────────────────────────────────────────────────────
('UAE_MOE',        'UAE Ministry of Education',             'AE', 'MENA', 'Secondary',      'UAE National Curriculum Certificate'),
('EG_THANAWEYA',   'Egyptian Thanaweya Amma',               'EG', 'MENA', 'Pre-University', 'Egyptian General Secondary Certificate'),
('NG_WAEC',        'West African WAEC',                     'NG', 'Africa', 'Secondary',    'West African Senior School Certificate'),
('NG_JAMB',        'Nigeria JAMB UTME',                     'NG', 'Africa', 'University',   'Joint Admissions and Matriculation Board'),
('SA_NSC',         'South Africa NSC',                      'ZA', 'Africa', 'Pre-University','National Senior Certificate (Matric)'),

-- ── English Language ─────────────────────────────────────────────────────────
('IELTS',          'IELTS',                                 'GB', 'International', 'Professional', 'International English Language Testing System'),
('TOEFL',          'TOEFL iBT',                             'US', 'International', 'Professional', 'Test of English as a Foreign Language'),
('PTE_ACADEMIC',   'PTE Academic',                          'GB', 'International', 'Professional', 'Pearson Test of English Academic'),
('CAMBRIDGE_ENG',  'Cambridge English (C1/C2)',              'GB', 'International', 'Professional', 'Cambridge C1 Advanced / C2 Proficiency'),

-- ── Technology & Professional ─────────────────────────────────────────────────
('CFA',            'CFA — Chartered Financial Analyst',     'US', 'Professional', 'Professional', 'CFA Institute Levels I, II, III'),
('ACCA',           'ACCA',                                  'GB', 'Professional', 'Professional', 'Association of Chartered Certified Accountants'),
('COMPTIA_APLUS',  'CompTIA A+',                            'US', 'Professional', 'Professional', 'CompTIA A+ IT Fundamentals'),
('COMPTIA_NET',    'CompTIA Network+',                      'US', 'Professional', 'Professional', 'CompTIA Network+'),
('COMPTIA_SEC',    'CompTIA Security+',                     'US', 'Professional', 'Professional', 'CompTIA Security+'),
('AWS_SAA',        'AWS Solutions Architect Associate',      'US', 'Professional', 'Professional', 'Amazon Web Services SAA-C03'),
('AWS_DVA',        'AWS Developer Associate',                'US', 'Professional', 'Professional', 'Amazon Web Services DVA-C02'),
('GCP_ACE',        'Google Cloud Associate CE',              'US', 'Professional', 'Professional', 'Google Cloud Associate Cloud Engineer'),
('AZ_900',         'Microsoft Azure AZ-900',                 'US', 'Professional', 'Professional', 'Microsoft Azure Fundamentals'),
('AZ_104',         'Microsoft Azure AZ-104',                 'US', 'Professional', 'Professional', 'Microsoft Azure Administrator')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 2. CURRICULA (per exam_board × subject — AI generated, shared/cached)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.curricula (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_board_id   UUID NOT NULL REFERENCES public.exam_boards(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  syllabus_year   INT  NOT NULL DEFAULT date_part('year', now())::int,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','generating','complete','failed')),
  topic_count     INT  NOT NULL DEFAULT 0,
  generated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_board_id, subject, syllabus_year)
);

CREATE TRIGGER curricula_set_updated_at
  BEFORE UPDATE ON public.curricula
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS curricula_board_subject_idx
  ON public.curricula (exam_board_id, subject);

-- =============================================================================
-- 3. CURRICULUM TOPICS (self-referencing tree)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.curriculum_topics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id    UUID NOT NULL REFERENCES public.curricula(id) ON DELETE CASCADE,
  parent_topic_id  UUID REFERENCES public.curriculum_topics(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  position         INT  NOT NULL DEFAULT 0,   -- order within parent
  depth            INT  NOT NULL DEFAULT 0,   -- 0 = chapter, 1 = section, 2 = subsection
  estimated_hours  NUMERIC(4,1) NOT NULL DEFAULT 1.0,
  difficulty       INT  NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS curriculum_topics_curriculum_idx
  ON public.curriculum_topics (curriculum_id, position);
CREATE INDEX IF NOT EXISTS curriculum_topics_parent_idx
  ON public.curriculum_topics (parent_topic_id);

-- =============================================================================
-- 4. CURRICULUM PREREQUISITES (topic → required topic)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.curriculum_prerequisites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id          UUID NOT NULL REFERENCES public.curriculum_topics(id) ON DELETE CASCADE,
  required_topic_id UUID NOT NULL REFERENCES public.curriculum_topics(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_id, required_topic_id)
);

-- =============================================================================
-- 5. USER CURRICULUM ENROLLMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_curriculum_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curriculum_id   UUID NOT NULL REFERENCES public.curricula(id) ON DELETE CASCADE,
  target_date     DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, curriculum_id)
);

CREATE TRIGGER user_enrollments_set_updated_at
  BEFORE UPDATE ON public.user_curriculum_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS user_enrollments_user_idx
  ON public.user_curriculum_enrollments (user_id, is_active);

ALTER TABLE public.user_curriculum_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_enrollments" ON public.user_curriculum_enrollments
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 6. USER TOPIC PROGRESS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_topic_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id        UUID NOT NULL REFERENCES public.curriculum_topics(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'locked'
                  CHECK (status IN ('locked','available','in_progress','complete')),
  mastery_score   NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (mastery_score BETWEEN 0 AND 1),
  sessions_count  INT NOT NULL DEFAULT 0,
  last_studied_at TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_id)
);

CREATE TRIGGER user_topic_progress_set_updated_at
  BEFORE UPDATE ON public.user_topic_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS user_topic_progress_user_topic_idx
  ON public.user_topic_progress (user_id, topic_id);
CREATE INDEX IF NOT EXISTS user_topic_progress_status_idx
  ON public.user_topic_progress (user_id, status);

ALTER TABLE public.user_topic_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_topic_progress" ON public.user_topic_progress
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 7. LEARNING STYLE PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.learning_style_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  primary_style   TEXT NOT NULL DEFAULT 'mixed'
                  CHECK (primary_style IN ('visual','conceptual','example_driven','step_by_step','mixed')),
  visual_score        NUMERIC(4,3) NOT NULL DEFAULT 0.2,
  conceptual_score    NUMERIC(4,3) NOT NULL DEFAULT 0.2,
  example_score       NUMERIC(4,3) NOT NULL DEFAULT 0.2,
  step_by_step_score  NUMERIC(4,3) NOT NULL DEFAULT 0.2,
  sessions_analysed   INT NOT NULL DEFAULT 0,
  raw_signals         JSONB NOT NULL DEFAULT '[]',   -- last 50 session signals
  last_analysed_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER learning_style_set_updated_at
  BEFORE UPDATE ON public.learning_style_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.learning_style_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_learning_style" ON public.learning_style_profiles
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 8. SPACED REPETITION CARDS (SM-2)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sr_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject           TEXT NOT NULL,
  topic             TEXT NOT NULL,
  source_type       TEXT NOT NULL DEFAULT 'tutoring'
                    CHECK (source_type IN ('tutoring','quiz','manual','curriculum')),
  source_id         UUID,                          -- tutoring_session_id or quiz_session_id
  front             TEXT NOT NULL,                 -- question / prompt
  back              TEXT NOT NULL,                 -- answer / explanation
  -- SM-2 fields
  easiness_factor   NUMERIC(4,3) NOT NULL DEFAULT 2.5,
  interval_days     INT          NOT NULL DEFAULT 1,
  repetitions       INT          NOT NULL DEFAULT 0,
  last_quality      INT          CHECK (last_quality BETWEEN 0 AND 5),
  next_review_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at  TIMESTAMPTZ,
  -- Stats
  total_reviews     INT NOT NULL DEFAULT 0,
  correct_reviews   INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER sr_cards_set_updated_at
  BEFORE UPDATE ON public.sr_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS sr_cards_user_review_idx
  ON public.sr_cards (user_id, next_review_date);
CREATE INDEX IF NOT EXISTS sr_cards_user_subject_idx
  ON public.sr_cards (user_id, subject);

ALTER TABLE public.sr_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_sr_cards" ON public.sr_cards
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 9. SUBJECT DEPENDENCY GRAPH (seeded — shared reference table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subject_dependencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         TEXT NOT NULL,          -- the subject being unlocked
  requires        TEXT NOT NULL,          -- must have this first
  strength        TEXT NOT NULL DEFAULT 'recommended'
                  CHECK (strength IN ('required','recommended','helpful')),
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject, requires)
);

-- Seed ~40 subject dependency relationships
INSERT INTO public.subject_dependencies (subject, requires, strength, description) VALUES
-- ── Mathematics chain ─────────────────────────────────────────────────────────
('Algebra',              'Arithmetic',             'required',    'Algebraic manipulation needs solid number sense'),
('Geometry',             'Arithmetic',             'required',    'Measurement and calculation depend on arithmetic'),
('Trigonometry',         'Algebra',                'required',    'Trig equations are algebraic; ratios need algebra'),
('Trigonometry',         'Geometry',               'required',    'Triangles and angles are geometric foundations'),
('Pre-Calculus',         'Trigonometry',           'required',    'Functions and limits build on trig'),
('Pre-Calculus',         'Algebra',                'required',    'Polynomial and rational functions need algebra'),
('Calculus',             'Pre-Calculus',           'required',    'Limits, derivatives, and integrals need pre-calc'),
('Statistics',           'Algebra',                'required',    'Statistical formulas are algebraic'),
('Statistics',           'Probability',            'recommended', 'Distributions build on probability theory'),
('Probability',          'Algebra',                'required',    'Probability calculations need algebraic thinking'),
('Linear Algebra',       'Calculus',               'recommended', 'Vector spaces connect to multivariable calc'),
('Linear Algebra',       'Algebra',                'required',    'Matrix algebra is an extension of algebra'),
('Differential Equations','Calculus',              'required',    'DEs are calculus applied to rates of change'),

-- ── Sciences chain ────────────────────────────────────────────────────────────
('Biology',              'Chemistry',              'recommended', 'Biochemistry, cellular processes use chemistry'),
('Chemistry',            'Algebra',                'required',    'Stoichiometry and equations need algebra'),
('Chemistry',            'Arithmetic',             'required',    'Mole calculations need strong numeracy'),
('Physics',              'Algebra',                'required',    'All physics formulas are algebraic'),
('Physics',              'Trigonometry',           'required',    'Vectors, waves, and optics need trig'),
('Physics',              'Calculus',               'recommended', 'Mechanics and electromagnetism use derivatives'),
('Genetics',             'Biology',                'required',    'Genetics is a branch of biology'),
('Molecular Biology',    'Genetics',               'required',    'Molecular biology extends genetics'),
('Molecular Biology',    'Chemistry',              'required',    'Biochemical reactions are core to molecular bio'),
('Biochemistry',         'Chemistry',              'required',    'Biochemistry is applied organic chemistry'),
('Biochemistry',         'Biology',                'required',    'Biochemistry explains biological processes'),
('Organic Chemistry',    'Chemistry',              'required',    'Organic builds directly on general chemistry'),
('Physical Chemistry',   'Chemistry',              'required',    'Thermodynamics and kinetics need general chem'),
('Physical Chemistry',   'Calculus',               'recommended', 'Rate equations and equilibria use derivatives'),
('Astronomy',            'Physics',                'required',    'Astrophysics applies mechanics and EM'),
('Environmental Science','Biology',                'recommended', 'Ecosystems and ecology need biology'),
('Environmental Science','Chemistry',              'recommended', 'Atmospheric chemistry and pollution need chem'),

-- ── Computer Science chain ────────────────────────────────────────────────────
('Programming Fundamentals','Algebra',             'recommended', 'Variables and logic map to algebra'),
('Data Structures',      'Programming Fundamentals','required',   'Implementing DS needs solid coding foundations'),
('Algorithms',           'Data Structures',        'required',    'Algorithm analysis builds on DS knowledge'),
('Discrete Mathematics', 'Algebra',                'required',    'Sets, logic, and proofs need algebraic thinking'),
('Algorithms',           'Discrete Mathematics',   'recommended', 'Complexity and graph theory use discrete math'),
('Machine Learning',     'Statistics',             'required',    'ML models are fundamentally statistical'),
('Machine Learning',     'Linear Algebra',         'required',    'Neural nets and transforms use matrix math'),
('Machine Learning',     'Calculus',               'required',    'Gradient descent needs calculus'),
('Database Design',      'Programming Fundamentals','recommended','SQL and schema design follow programming logic'),
('Computer Networks',    'Programming Fundamentals','recommended','Network programming needs coding basics'),
('Cybersecurity',        'Computer Networks',      'recommended', 'Security depends on understanding networks'),

-- ── Humanities / Social Sciences ──────────────────────────────────────────────
('Economics',            'Statistics',             'recommended', 'Econometrics and data analysis use stats'),
('Economics',            'Algebra',                'recommended', 'Supply/demand models are algebraic'),
('Psychology',           'Statistics',             'recommended', 'Psychological research is heavily statistical'),
('Sociology',            'Statistics',             'helpful',     'Social research methods use basic stats'),
('Philosophy of Science','Biology',                'helpful',     'Understanding scientific claims needs domain context')
ON CONFLICT (subject, requires) DO NOTHING;

-- =============================================================================
-- RLS for shared reference tables (read-only for everyone, write for service)
-- =============================================================================
ALTER TABLE public.exam_boards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curricula              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_topics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_dependencies   ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all reference data
CREATE POLICY "authenticated_read_exam_boards"
  ON public.exam_boards FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_curricula"
  ON public.curricula FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_topics"
  ON public.curriculum_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_prerequisites"
  ON public.curriculum_prerequisites FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_subject_deps"
  ON public.subject_dependencies FOR SELECT TO authenticated USING (true);

-- Service role can write (edge functions use service role)
CREATE POLICY "service_write_curricula"
  ON public.curricula FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_write_topics"
  ON public.curriculum_topics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_write_prerequisites"
  ON public.curriculum_prerequisites FOR ALL TO service_role USING (true) WITH CHECK (true);
