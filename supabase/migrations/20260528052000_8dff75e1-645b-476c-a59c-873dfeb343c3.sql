CREATE OR REPLACE FUNCTION public.prevent_effective_usdt_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF current_setting('app.allow_effective_usdt_correction', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.effective_usdt_qty IS NOT NULL AND NEW.effective_usdt_qty IS DISTINCT FROM OLD.effective_usdt_qty THEN
    RAISE EXCEPTION 'Cannot modify effective_usdt_qty once set. Use adjustment entries for corrections.';
  END IF;
  IF OLD.effective_usdt_rate IS NOT NULL AND NEW.effective_usdt_rate IS DISTINCT FROM OLD.effective_usdt_rate THEN
    RAISE EXCEPTION 'Cannot modify effective_usdt_rate once set. Use adjustment entries for corrections.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_purchase_order_effective_usdt(
  p_order_id uuid,
  p_reason text DEFAULT 'Purchase order edit recalculation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_row RECORD;
  v_product_code TEXT;
  v_market_rate NUMERIC;
  v_effective_qty NUMERIC;
  v_effective_rate NUMERIC;
  v_old_effective_qty NUMERIC;
  v_old_effective_rate NUMERIC;
  v_old_market_rate NUMERIC;
BEGIN
  SELECT
    po.id,
    po.order_number,
    po.quantity,
    po.total_amount,
    po.market_rate_usdt,
    po.effective_usdt_qty,
    po.effective_usdt_rate,
    p.code AS product_code
  INTO v_row
  FROM public.purchase_orders po
  LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
  LEFT JOIN public.products p ON p.id = poi.product_id
  WHERE po.id = p_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found', p_order_id;
  END IF;

  v_product_code := UPPER(COALESCE(v_row.product_code, 'USDT'));
  v_market_rate := CASE
    WHEN v_product_code = 'USDT' THEN 1
    ELSE COALESCE(v_row.market_rate_usdt, 0)
  END;

  IF COALESCE(v_row.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot recalculate effective USDT valuation with non-positive quantity for order %', v_row.order_number;
  END IF;

  IF v_market_rate <= 0 THEN
    RAISE EXCEPTION 'Missing locked market_rate_usdt for non-USDT purchase order %', v_row.order_number;
  END IF;

  v_old_effective_qty := v_row.effective_usdt_qty;
  v_old_effective_rate := v_row.effective_usdt_rate;
  v_old_market_rate := v_row.market_rate_usdt;
  v_effective_qty := v_row.quantity * v_market_rate;
  v_effective_rate := CASE WHEN v_effective_qty > 0 THEN v_row.total_amount / v_effective_qty ELSE NULL END;

  PERFORM set_config('app.allow_effective_usdt_correction', 'on', true);

  UPDATE public.purchase_orders
  SET
    market_rate_usdt = v_market_rate,
    effective_usdt_qty = v_effective_qty,
    effective_usdt_rate = v_effective_rate,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.system_action_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    module,
    metadata,
    recorded_at,
    user_name
  ) VALUES (
    auth.uid(),
    'EFFECTIVE_USDT_RECALCULATED',
    'PURCHASE_ORDER',
    p_order_id,
    'PURCHASE',
    jsonb_build_object(
      'order_number', v_row.order_number,
      'reason', p_reason,
      'product_code', v_product_code,
      'old_market_rate_usdt', v_old_market_rate,
      'new_market_rate_usdt', v_market_rate,
      'old_effective_usdt_qty', v_old_effective_qty,
      'new_effective_usdt_qty', v_effective_qty,
      'old_effective_usdt_rate', v_old_effective_rate,
      'new_effective_usdt_rate', v_effective_rate
    ),
    now(),
    COALESCE(auth.uid()::text, 'system')
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_row.order_number,
    'product_code', v_product_code,
    'market_rate_usdt', v_market_rate,
    'effective_usdt_qty', v_effective_qty,
    'effective_usdt_rate', v_effective_rate
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_purchase_order_effective_usdt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_purchase_order_effective_usdt(uuid, text) TO service_role;

SELECT public.recalculate_purchase_order_effective_usdt(
  'a28ca90e-5c84-4f7d-ab2b-8b641f6c0ff7'::uuid,
  'One-time correction after completed BTC purchase order quantity edit left stale effective-USDT valuation'
);