
-- P1: Rewrite update_client_monthly_usage_on_sale to use sargable range query
CREATE OR REPLACE FUNCTION public.update_client_monthly_usage_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_computed_usage NUMERIC;
  v_month_start DATE;
  v_month_end DATE;
BEGIN
  v_month_start := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date;

  IF TG_OP = 'DELETE' THEN
    v_client_id := OLD.client_id;
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

    -- Recompute for OLD client if client changed
    IF TG_OP = 'UPDATE' AND OLD.client_id IS NOT NULL AND OLD.client_id != COALESCE(NEW.client_id, OLD.client_id) THEN
      SELECT COALESCE(SUM(total_amount), 0) INTO v_computed_usage
      FROM public.sales_orders
      WHERE client_id = OLD.client_id
        AND status = 'COMPLETED'
        AND order_date >= v_month_start
        AND order_date < v_month_end;

      UPDATE public.clients
      SET current_month_used = v_computed_usage, updated_at = now()
      WHERE id = OLD.client_id;
    END IF;
  END IF;

  IF v_client_id IS NOT NULL THEN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_computed_usage
    FROM public.sales_orders
    WHERE client_id = v_client_id
      AND status = 'COMPLETED'
      AND order_date >= v_month_start
      AND order_date < v_month_end;

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

-- P3: Add index for reference_type + reference_id lookups
CREATE INDEX IF NOT EXISTS idx_wt_reference ON public.wallet_transactions (reference_type, reference_id);
