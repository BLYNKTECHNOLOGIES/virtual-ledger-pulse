
-- =====================================================
-- S6: DB-level guard — cannot approve mismatched reconciliation without review notes
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_reconciliation_approval_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.has_mismatches = true AND (NEW.review_notes IS NULL OR TRIM(NEW.review_notes) = '') THEN
    RAISE EXCEPTION 'Cannot approve a reconciliation with mismatches without providing review notes.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_reconciliation_approval_notes ON public.shift_reconciliations;
CREATE TRIGGER trg_check_reconciliation_approval_notes
  BEFORE UPDATE ON public.shift_reconciliations
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.check_reconciliation_approval_notes();
