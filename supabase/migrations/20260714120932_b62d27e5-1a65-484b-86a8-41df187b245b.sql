
-- Guardrail: whenever an approval gets its cp_userno / resolved_client_id set,
-- propagate that identity to any earlier / sibling PENDING approvals that share
-- the same normalized name but have no identity yet. This prevents parallel
-- approvals from spawning duplicate client rows for the same real person.
CREATE OR REPLACE FUNCTION public.propagate_approval_identity_to_siblings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.resolved_client_id IS NULL AND NEW.cp_userno IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.client_onboarding_approvals sib
     SET resolved_client_id = COALESCE(sib.resolved_client_id, NEW.resolved_client_id),
         cp_userno         = COALESCE(sib.cp_userno,         NEW.cp_userno),
         updated_at        = now()
   WHERE sib.id <> NEW.id
     AND sib.approval_status = 'PENDING'
     AND upper(btrim(sib.client_name)) = upper(btrim(NEW.client_name))
     AND (
           -- fill identity where missing
           (sib.resolved_client_id IS NULL AND NEW.resolved_client_id IS NOT NULL)
        OR (sib.cp_userno IS NULL         AND NEW.cp_userno         IS NOT NULL)
     )
     -- Never override an existing DIFFERENT userno (protects "same name, different userNo = different clients")
     AND (sib.cp_userno IS NULL OR NEW.cp_userno IS NULL OR sib.cp_userno = NEW.cp_userno)
     AND (sib.resolved_client_id IS NULL OR NEW.resolved_client_id IS NULL OR sib.resolved_client_id = NEW.resolved_client_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_approval_identity ON public.client_onboarding_approvals;
CREATE TRIGGER trg_propagate_approval_identity
AFTER INSERT OR UPDATE OF cp_userno, resolved_client_id
ON public.client_onboarding_approvals
FOR EACH ROW
EXECUTE FUNCTION public.propagate_approval_identity_to_siblings();
