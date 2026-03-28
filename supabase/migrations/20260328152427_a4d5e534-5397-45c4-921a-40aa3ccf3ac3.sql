
-- B14: Replace UNIQUE index with regular index on system_action_logs
-- This was silently dropping repeat audit entries for the same entity+action
DROP INDEX IF EXISTS public.idx_system_action_logs_entity_action;
CREATE INDEX idx_system_action_logs_entity_action ON public.system_action_logs (entity_id, action_type);

-- B15: Add validation trigger for approved_by on erp_product_conversions
CREATE OR REPLACE FUNCTION public.validate_conversion_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND NEW.approved_by IS NULL THEN
    RAISE EXCEPTION 'approved_by is required when status is APPROVED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_conversion_approval ON public.erp_product_conversions;
CREATE TRIGGER trg_validate_conversion_approval
  BEFORE INSERT OR UPDATE ON public.erp_product_conversions
  FOR EACH ROW EXECUTE FUNCTION public.validate_conversion_approval();

-- B16: Add composite index for wallet_transactions trigger performance
CREATE INDEX IF NOT EXISTS idx_wt_wallet_asset ON public.wallet_transactions (wallet_id, asset_code);

-- B17: Add expires_at column to password_reset_requests
ALTER TABLE public.password_reset_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '48 hours';

-- B17: Auto-expire stale requests on resolution attempt
CREATE OR REPLACE FUNCTION public.validate_password_reset_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status != 'pending' THEN
    IF OLD.expires_at IS NOT NULL AND OLD.expires_at < NOW() THEN
      NEW.status := 'expired';
      NEW.resolver_note := COALESCE(NEW.resolver_note, '') || ' [Auto-expired: request was past 48h deadline]';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_password_reset ON public.password_reset_requests;
CREATE TRIGGER trg_validate_password_reset
  BEFORE UPDATE ON public.password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_password_reset_resolution();
