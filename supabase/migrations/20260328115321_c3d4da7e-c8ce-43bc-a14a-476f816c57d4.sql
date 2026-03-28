
-- =====================================================
-- Fix: Replace incremental current_month_used trigger with full recompute
-- Root cause: incremental SET +/- drifts due to deletions, edits, month boundaries
-- Solution: Always recompute from actual COMPLETED sales_orders for current month
-- =====================================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_update_client_monthly_usage ON public.sales_orders;

-- Replace with recompute-based function
CREATE OR REPLACE FUNCTION public.update_client_monthly_usage_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_id UUID;
  v_computed_usage NUMERIC;
BEGIN
  -- Determine which client to recompute for
  -- On DELETE, use OLD; otherwise use NEW
  IF TG_OP = 'DELETE' THEN
    v_client_id := OLD.client_id;
    -- Fallback to name lookup if client_id is null
    IF v_client_id IS NULL AND OLD.client_name IS NOT NULL THEN
      SELECT id INTO v_client_id FROM public.clients
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(OLD.client_name)) LIMIT 1;
    END IF;
  ELSE
    v_client_id := NEW.client_id;
    IF v_client_id IS NULL AND NEW.client_name IS NOT NULL THEN
      SELECT id INTO v_client_id FROM public.clients
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name)) LIMIT 1;
    END IF;
    
    -- Also recompute for OLD client if client changed (e.g. reassignment)
    IF TG_OP = 'UPDATE' AND OLD.client_id IS NOT NULL AND OLD.client_id != COALESCE(NEW.client_id, OLD.client_id) THEN
      SELECT COALESCE(SUM(total_amount), 0) INTO v_computed_usage
      FROM public.sales_orders
      WHERE client_id = OLD.client_id
        AND status = 'COMPLETED'
        AND DATE_TRUNC('month', order_date::date) = DATE_TRUNC('month', CURRENT_DATE);
      
      UPDATE public.clients
      SET current_month_used = v_computed_usage, updated_at = now()
      WHERE id = OLD.client_id;
    END IF;
  END IF;

  -- Recompute from actual completed orders for current month
  IF v_client_id IS NOT NULL THEN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_computed_usage
    FROM public.sales_orders
    WHERE client_id = v_client_id
      AND status = 'COMPLETED'
      AND DATE_TRUNC('month', order_date::date) = DATE_TRUNC('month', CURRENT_DATE);

    UPDATE public.clients
    SET current_month_used = v_computed_usage, updated_at = now()
    WHERE id = v_client_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate trigger — now also fires on DELETE
CREATE TRIGGER trg_update_client_monthly_usage
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_monthly_usage_on_sale();

-- =====================================================
-- Data repair: Recompute current_month_used for ALL clients from actual orders
-- =====================================================
UPDATE public.clients c
SET current_month_used = COALESCE(computed.total, 0),
    updated_at = now()
FROM (
  SELECT so.client_id, SUM(so.total_amount) as total
  FROM public.sales_orders so
  WHERE so.status = 'COMPLETED'
    AND DATE_TRUNC('month', so.order_date::date) = DATE_TRUNC('month', CURRENT_DATE)
    AND so.client_id IS NOT NULL
  GROUP BY so.client_id
) computed
WHERE c.id = computed.client_id
  AND c.current_month_used != COALESCE(computed.total, 0);

-- Also zero out clients who have no completed orders this month but still show usage
UPDATE public.clients
SET current_month_used = 0, updated_at = now()
WHERE current_month_used > 0
  AND id NOT IN (
    SELECT DISTINCT client_id FROM public.sales_orders
    WHERE status = 'COMPLETED'
      AND DATE_TRUNC('month', order_date::date) = DATE_TRUNC('month', CURRENT_DATE)
      AND client_id IS NOT NULL
  );
