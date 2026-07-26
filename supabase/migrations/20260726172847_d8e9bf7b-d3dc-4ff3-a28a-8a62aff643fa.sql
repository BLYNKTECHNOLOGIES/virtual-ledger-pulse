-- R13 seam #1 · Recruitment 'hired' -> Onboarding pipeline auto-provision
-- Idempotent trigger: creates a draft onboarding row exactly once per hired candidate.

CREATE OR REPLACE FUNCTION public.hr_candidate_hired_to_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text;
  v_last  text;
  v_space int;
BEGIN
  -- Only act when the candidate transitions into a "hired" state
  IF NOT (
       (COALESCE(NEW.hired, false) = true AND COALESCE(OLD.hired, false) = false)
    OR (NEW.hired_date IS NOT NULL AND OLD.hired_date IS NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- De-dup: never create a second onboarding row for the same candidate
  IF EXISTS (
    SELECT 1 FROM public.hr_employee_onboarding WHERE candidate_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Best-effort first/last split from candidate.name
  v_space := position(' ' IN COALESCE(NEW.name, ''));
  IF v_space > 0 THEN
    v_first := substring(NEW.name FROM 1 FOR v_space - 1);
    v_last  := substring(NEW.name FROM v_space + 1);
  ELSE
    v_first := NEW.name;
    v_last  := NULL;
  END IF;

  INSERT INTO public.hr_employee_onboarding (
    candidate_id,
    first_name,
    last_name,
    email,
    phone,
    date_of_joining,
    job_role,
    status,
    current_stage,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    v_first,
    v_last,
    NEW.email,
    NEW.mobile,
    COALESCE(NEW.joining_date, NEW.hired_date),
    NULL,
    'draft',
    1,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_candidate_hired_to_onboarding ON public.hr_candidates;
CREATE TRIGGER trg_hr_candidate_hired_to_onboarding
AFTER UPDATE ON public.hr_candidates
FOR EACH ROW
EXECUTE FUNCTION public.hr_candidate_hired_to_onboarding();

COMMENT ON FUNCTION public.hr_candidate_hired_to_onboarding IS
  'R13 seam #1 · When a recruitment candidate is marked hired, auto-provisions a draft row in hr_employee_onboarding. Idempotent by candidate_id.';