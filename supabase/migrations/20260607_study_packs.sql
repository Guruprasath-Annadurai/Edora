-- ═══════════════════════════════════════════════════════════════
-- Edora — Study Packs
-- Stores AI-generated study packs created from uploaded PDFs.
-- PDF binary stored in Supabase Storage bucket "study-pdfs".
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_packs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name   TEXT        NOT NULL,
  pdf_path    TEXT,                      -- storage path: {user_id}/{pack_id}.pdf (nullable — upload is best-effort)
  summary     TEXT        NOT NULL DEFAULT '',
  flashcards  JSONB       NOT NULL DEFAULT '[]', -- [{front, back}]
  quiz        JSONB       NOT NULL DEFAULT '[]', -- [{question, options, correct_answer, explanation}]
  key_terms   JSONB       NOT NULL DEFAULT '[]', -- [{term, definition}]
  page_count  INTEGER,
  char_count  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user queries (most recent first)
CREATE INDEX IF NOT EXISTS study_packs_user_created
  ON public.study_packs(user_id, created_at DESC);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.study_packs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_packs' AND policyname='Users own their study packs'
  ) THEN
    CREATE POLICY "Users own their study packs" ON public.study_packs FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 3. Storage bucket ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('study-pdfs', 'study-pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users upload own PDFs') THEN
    CREATE POLICY "Users upload own PDFs" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'study-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users read own PDFs') THEN
    CREATE POLICY "Users read own PDFs" ON storage.objects FOR SELECT
      USING (bucket_id = 'study-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users delete own PDFs') THEN
    CREATE POLICY "Users delete own PDFs" ON storage.objects FOR DELETE
      USING (bucket_id = 'study-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
