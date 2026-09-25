-- V5 Backend: Exam Target Normalization Contract
--
-- Guarantees exam_name != NULL across public.profiles with fallback 'GENERAL'.
-- Compatible with legacy 4.0.0 clients (transparent trigger normalization:
-- clients sending null/empty string are automatically normalized to 'GENERAL'
-- without query rejection).

-- 1. Default constraint
ALTER TABLE public.profiles
  ALTER COLUMN exam_name SET DEFAULT 'GENERAL';

-- 2. Backfill existing null/empty rows
UPDATE public.profiles
SET exam_name = 'GENERAL'
WHERE exam_name IS NULL OR btrim(exam_name) = '';

-- 3. Trigger for 4.0.0 client compatibility and constraint guarantee
CREATE OR REPLACE FUNCTION public.normalize_profile_exam_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.exam_name IS NULL OR btrim(NEW.exam_name) = '' THEN
    NEW.exam_name := 'GENERAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_profile_exam_name ON public.profiles;
CREATE TRIGGER trg_normalize_profile_exam_name
  BEFORE INSERT OR UPDATE OF exam_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_exam_name();

COMMENT ON FUNCTION public.normalize_profile_exam_name() IS
  'V5 Backend: Coerces null or empty exam_name to GENERAL for 4.0.0 compatibility and guaranteed non-null state.';
