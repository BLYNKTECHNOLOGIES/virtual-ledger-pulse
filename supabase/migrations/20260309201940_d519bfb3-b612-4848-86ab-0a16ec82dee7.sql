
-- =====================================================
-- Phase 1: Auto-increment client monthly usage on sales completion
-- Creates a trigger on sales_orders that updates clients.current_month_used
-- when a sales order transitions to COMPLETED status
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_client_monthly_usage_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when status changes to COMPLETED
  IF NEW.status = 'COMPLETED' AND (OLD IS NULL OR OLD.status != 'COMPLETED') THEN
    IF NEW.client_name IS NOT NULL AND COALESCE(NEW.total_amount, 0) > 0 THEN
      UPDATE public.clients
      SET current_month_used = COALESCE(current_month_used, 0) + COALESCE(NEW.total_amount, 0),
          updated_at = now()
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name));
    END IF;
  END IF;

  -- Handle status reverting FROM COMPLETED (e.g., edit back to pending)
  IF OLD IS NOT NULL AND OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
    IF NEW.client_name IS NOT NULL AND COALESCE(OLD.total_amount, 0) > 0 THEN
      UPDATE public.clients
      SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(OLD.total_amount, 0)),
          updated_at = now()
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_client_monthly_usage
  AFTER INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_monthly_usage_on_sale();
