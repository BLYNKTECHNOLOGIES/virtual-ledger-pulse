CREATE OR REPLACE FUNCTION public.sync_split_payment_settlements(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_inserted int := 0;
  v_removed int := 0;
BEGIN
  SELECT id, order_number, client_name, order_date, is_split_payment
    INTO v_order
    FROM public.sales_orders
   WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF NOT COALESCE(v_order.is_split_payment, false) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'not a split order');
  END IF;

  -- One PENDING settlement per gateway split, amounts kept in sync.
  WITH ins AS (
    INSERT INTO public.pending_settlements (
      sales_order_id, order_number, client_name, total_amount, settlement_amount,
      order_date, payment_method_id, bank_account_id, settlement_cycle, settlement_days,
      expected_settlement_date, status
    )
    SELECT
      v_order.id, v_order.order_number, v_order.client_name, s.amount, s.amount,
      v_order.order_date::date, s.payment_method_id,
      COALESCE(s.bank_account_id, spm.bank_account_id),
      COALESCE(spm.settlement_cycle, 'T+1 Day'), spm.settlement_days,
      (v_order.order_date::date + INTERVAL '1 day' * COALESCE(NULLIF(spm.settlement_days, 0), 1))::date,
      'PENDING'
    FROM public.sales_order_payment_splits s
    JOIN public.sales_payment_methods spm ON spm.id = s.payment_method_id
    WHERE s.sales_order_id = v_order.id
      AND COALESCE(spm.payment_gateway, false) = true
    ON CONFLICT (sales_order_id, payment_method_id) DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      settlement_amount = CASE WHEN public.pending_settlements.status = 'SETTLED'
                               THEN public.pending_settlements.settlement_amount
                               ELSE EXCLUDED.settlement_amount END,
      bank_account_id = COALESCE(public.pending_settlements.bank_account_id, EXCLUDED.bank_account_id),
      order_number = EXCLUDED.order_number,
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  -- Drop unsettled rows for methods no longer part of the split set.
  WITH del AS (
    DELETE FROM public.pending_settlements ps
    WHERE ps.sales_order_id = v_order.id
      AND ps.status <> 'SETTLED'
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_order_payment_splits s
        WHERE s.sales_order_id = v_order.id
          AND s.payment_method_id = ps.payment_method_id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM del;

  RETURN jsonb_build_object('success', true, 'synced', v_inserted, 'removed', v_removed);
END $$;

GRANT EXECUTE ON FUNCTION public.sync_split_payment_settlements(uuid) TO authenticated, service_role;

-- Backfill every split order whose gateway leg lost its settlement row.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT so.id
    FROM public.sales_orders so
    JOIN public.sales_order_payment_splits s ON s.sales_order_id = so.id
    LEFT JOIN public.pending_settlements ps
      ON ps.sales_order_id = so.id AND ps.payment_method_id = s.payment_method_id
    JOIN public.sales_payment_methods spm ON spm.id = s.payment_method_id
    WHERE COALESCE(so.is_split_payment, false)
      AND COALESCE(spm.payment_gateway, false)
      AND ps.id IS NULL
  LOOP
    PERFORM public.sync_split_payment_settlements(r.id);
  END LOOP;
END $$;