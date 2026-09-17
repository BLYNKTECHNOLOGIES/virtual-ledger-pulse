CREATE OR REPLACE FUNCTION public.reverse_payment_gateway_settlement(p_settlement_id uuid, p_reversed_by uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settlement record;
  v_item record;
  v_guard_inserted boolean;
  v_restored_count int := 0;
  v_bt record;
BEGIN
  INSERT INTO reversal_guards (entity_type, entity_id, action)
  VALUES ('payment_gateway_settlement', p_settlement_id, 'reverse')
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_guard_inserted;

  IF v_guard_inserted IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'This settlement has already been reversed or is currently being reversed.');
  END IF;

  SELECT * INTO v_settlement
  FROM payment_gateway_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF v_settlement IS NULL THEN
    DELETE FROM reversal_guards
    WHERE entity_type = 'payment_gateway_settlement'
      AND entity_id = p_settlement_id
      AND action = 'reverse';
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found.');
  END IF;

  IF v_settlement.status = 'REVERSED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement is already reversed.');
  END IF;

  -- Mark this batch non-live first. The pending-row duplicate guard must not mistake
  -- the batch currently being reversed for another completed settlement.
  UPDATE payment_gateway_settlement_items
  SET reversed_at = now()
  WHERE settlement_id = p_settlement_id
    AND reversed_at IS NULL;

  UPDATE payment_gateway_settlements
  SET status = 'REVERSED', updated_at = now(), reversed_by = p_reversed_by
  WHERE id = p_settlement_id;

  FOR v_item IN
    SELECT si.sales_order_id,
           si.amount,
           so.order_number,
           so.client_name,
           so.order_date,
           COALESCE(split.payment_method_id, so.sales_payment_method_id) AS payment_method_id,
           COALESCE(split.bank_account_id, v_settlement.bank_account_id) AS bank_account_id
    FROM payment_gateway_settlement_items si
    JOIN sales_orders so ON so.id = si.sales_order_id
    LEFT JOIN LATERAL (
      SELECT sps.payment_method_id, sps.bank_account_id
      FROM sales_order_payment_splits sps
      WHERE sps.sales_order_id = si.sales_order_id
        AND sps.is_gateway = true
        AND abs(sps.amount - si.amount) < 0.01
      ORDER BY (sps.bank_account_id = v_settlement.bank_account_id) DESC, sps.created_at
      LIMIT 1
    ) split ON true
    WHERE si.settlement_id = p_settlement_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items other_si
      JOIN payment_gateway_settlements other_pgs ON other_pgs.id = other_si.settlement_id
      WHERE other_si.sales_order_id = v_item.sales_order_id
        AND other_pgs.id <> p_settlement_id
        AND other_pgs.status = 'COMPLETED'
        AND other_si.reversed_at IS NULL
        AND abs(other_si.amount - v_item.amount) < 0.01
    ) THEN
      INSERT INTO pending_settlements (
        sales_order_id, order_number, client_name, total_amount, settlement_amount,
        order_date, payment_method_id, bank_account_id, status,
        actual_settlement_date, settled_at, settled_by, settlement_batch_id
      ) VALUES (
        v_item.sales_order_id, v_item.order_number, v_item.client_name,
        v_item.amount, v_item.amount, v_item.order_date,
        v_item.payment_method_id, v_item.bank_account_id, 'PENDING',
        NULL, NULL, NULL, NULL
      )
      ON CONFLICT (sales_order_id, payment_method_id) DO UPDATE SET
        order_number = EXCLUDED.order_number,
        client_name = EXCLUDED.client_name,
        total_amount = EXCLUDED.total_amount,
        settlement_amount = EXCLUDED.settlement_amount,
        order_date = EXCLUDED.order_date,
        bank_account_id = EXCLUDED.bank_account_id,
        status = 'PENDING',
        actual_settlement_date = NULL,
        settled_at = NULL,
        settled_by = NULL,
        settlement_batch_id = NULL,
        updated_at = now();

      IF FOUND THEN
        v_restored_count := v_restored_count + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE sales_orders so
  SET settlement_status = 'PENDING', settlement_batch_id = NULL, settled_at = NULL
  WHERE so.id IN (
    SELECT si.sales_order_id
    FROM payment_gateway_settlement_items si
    WHERE si.settlement_id = p_settlement_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM payment_gateway_settlement_items other_si
    JOIN payment_gateway_settlements other_pgs ON other_pgs.id = other_si.settlement_id
    WHERE other_si.sales_order_id = so.id
      AND other_pgs.id <> p_settlement_id
      AND other_pgs.status = 'COMPLETED'
      AND other_si.reversed_at IS NULL
  );

  FOR v_bt IN
    SELECT id
    FROM bank_transactions
    WHERE reference_number = v_settlement.settlement_batch_id
      AND transaction_type = 'INCOME'
      AND is_reversed = false
      AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_bank_transaction(v_bt.id,
      'Settlement reversal: ' || v_settlement.settlement_batch_id, p_reversed_by);
  END LOOP;

  FOR v_bt IN
    SELECT id
    FROM bank_transactions
    WHERE reference_number IN (
        'MDR-' || v_settlement.settlement_batch_id,
        v_settlement.settlement_batch_id || '-MDR'
      )
      AND transaction_type = 'EXPENSE'
      AND is_reversed = false
      AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_bank_transaction(v_bt.id,
      'MDR reversal: ' || v_settlement.settlement_batch_id, p_reversed_by);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement.settlement_batch_id,
    'reversed_amount', v_settlement.net_amount,
    'restored_count', v_restored_count
  );
END;
$function$;