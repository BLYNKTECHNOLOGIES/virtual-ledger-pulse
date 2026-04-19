-- ============================================================================
-- Ghost Client Cleanup + Prevention
-- ============================================================================

-- Part A: Soft-delete ghost clients (PENDING with no supporting evidence)
UPDATE public.clients c
SET is_deleted = true,
    deleted_at = now(),
    operator_notes = COALESCE(operator_notes || E'\n', '') || '[' || now()::date || '] Auto-cleanup: ghost client (no approval row, no orders, no nickname/verified-name evidence)'
WHERE c.is_deleted = false
  AND c.kyc_status = 'PENDING'
  AND (c.buyer_approval_status = 'PENDING' OR c.seller_approval_status = 'PENDING')
  AND NOT EXISTS (SELECT 1 FROM public.client_onboarding_approvals a WHERE a.resolved_client_id = c.id OR LOWER(TRIM(a.client_name)) = LOWER(TRIM(c.name)))
  AND NOT EXISTS (SELECT 1 FROM public.client_binance_nicknames n WHERE n.client_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.client_verified_names v WHERE v.client_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.client_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.supplier_name = c.name);

-- Part B: Constraint trigger to prevent NEW ghost clients
-- Runs at end-of-statement (DEFERRABLE) so the corresponding approval / order /
-- nickname row inserted in the same transaction is visible.
CREATE OR REPLACE FUNCTION public.fn_prevent_ghost_pending_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce on PENDING-status rows that haven't been soft-deleted
  IF NEW.is_deleted = true THEN RETURN NEW; END IF;
  IF NEW.buyer_approval_status IS DISTINCT FROM 'PENDING'
     AND NEW.seller_approval_status IS DISTINCT FROM 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- A PENDING client must have at least ONE supporting record
  IF EXISTS (SELECT 1 FROM public.client_onboarding_approvals a
              WHERE a.resolved_client_id = NEW.id
                 OR LOWER(TRIM(a.client_name)) = LOWER(TRIM(NEW.name)))
     OR EXISTS (SELECT 1 FROM public.client_binance_nicknames n WHERE n.client_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.client_verified_names v WHERE v.client_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.client_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.supplier_name = NEW.name)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot create PENDING client "%" without supporting evidence (approval row, linked nickname, verified name, or existing order). Insert as APPROVED for manual onboarding, or attach an onboarding approval / order in the same transaction.', NEW.name
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ghost_pending_client ON public.clients;
CREATE CONSTRAINT TRIGGER trg_prevent_ghost_pending_client
AFTER INSERT OR UPDATE OF buyer_approval_status, seller_approval_status, kyc_status ON public.clients
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_ghost_pending_client();