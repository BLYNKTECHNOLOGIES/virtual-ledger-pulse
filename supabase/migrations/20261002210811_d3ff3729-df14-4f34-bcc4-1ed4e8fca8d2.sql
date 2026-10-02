CREATE OR REPLACE FUNCTION public.hr_guard_revision_ctc_scale()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.previous_total,0) > 0 AND COALESCE(NEW.new_total,0) > 0
     AND (NEW.new_total / NEW.previous_total > 4 OR NEW.previous_total / NEW.new_total > 4) THEN
    RAISE EXCEPTION 'Salary change rejected: old CTC % and new CTC % differ more than 4x — one of them looks like a monthly figure. Enter both as annual CTC.', NEW.previous_total, NEW.new_total;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_guard_revision_ctc_scale ON public.hr_salary_revisions;
CREATE TRIGGER trg_hr_guard_revision_ctc_scale BEFORE INSERT OR UPDATE OF previous_total, new_total
ON public.hr_salary_revisions FOR EACH ROW EXECUTE FUNCTION public.hr_guard_revision_ctc_scale();