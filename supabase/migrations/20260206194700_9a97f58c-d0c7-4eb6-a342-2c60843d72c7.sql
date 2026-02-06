
CREATE OR REPLACE FUNCTION public.reverse_payment_gateway_settlement(p_settlement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement record;
  v_item record;
  v_guard_inserted boolean;
  v_restored_count int := 0;
BEGIN
  -- Prevent double-reversal using reversal_guards (entity_id is UUID)
  INSERT INTO reversal_guards (entity_type, entity_id)
  VALUES ('payment_gateway_settlement', p_settlement_id)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_guard_inserted;

  IF v_guard_inserted IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This settlement has already been reversed or is currently being reversed.'
    );
  END IF;

  -- Lock and fetch the settlement
  SELECT * INTO v_settlement
  FROM payment_gateway_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF v_settlement IS NULL THEN
    DELETE FROM reversal_guards WHERE entity_type = 'payment_gateway_settlement' AND entity_id = p_settlement_id;
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found.');
  END IF;

  IF v_settlement.status = 'REVERSED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement is already reversed.');
  END IF;

  -- Re-create pending_settlements from settlement items + sales_orders
  FOR v_item IN
    SELECT si.sales_order_id, si.amount,
           so.order_number, so.client_name, so.order_date,
           so.payment_method_id, so.settlement_status
    FROM payment_gateway_settlement_items si
    JOIN sales_orders so ON so.id = si.sales_order_id
    WHERE si.settlement_id = p_settlement_id
  LOOP
    INSERT INTO pending_settlements (
      sales_order_id, order_number, client_name, total_amount, settlement_amount,
      order_date, payment_method_id, bank_account_id, status
    )
    SELECT
      v_item.sales_order_id, v_item.order_number, v_item.client_name,
      v_item.amount, v_item.amount, v_item.order_date,
      v_item.payment_method_id, v_settlement.bank_account_id, 'PENDING'
    WHERE NOT EXISTS (
      SELECT 1 FROM pending_settlements WHERE sales_order_id = v_item.sales_order_id
    );

    UPDATE sales_orders
    SET settlement_status = 'PENDING'
    WHERE id = v_item.sales_order_id AND settlement_status = 'SETTLED';

    v_restored_count := v_restored_count + 1;
  END LOOP;

  -- Delete INCOME bank transaction
  DELETE FROM bank_transactions
  WHERE reference_number = v_settlement.settlement_batch_id
    AND transaction_type = 'INCOME';

  -- Delete MDR EXPENSE bank transaction if exists
  DELETE FROM bank_transactions
  WHERE reference_number = 'MDR-' || v_settlement.settlement_batch_id
    AND transaction_type = 'EXPENSE';

  -- Restore payment method usage
  UPDATE sales_payment_methods spm
  SET current_usage = spm.current_usage + sub.restored_total
  FROM (
    SELECT so.payment_method_id, SUM(si.amount) AS restored_total
    FROM payment_gateway_settlement_items si
    JOIN sales_orders so ON so.id = si.sales_order_id
    WHERE si.settlement_id = p_settlement_id AND so.payment_method_id IS NOT NULL
    GROUP BY so.payment_method_id
  ) sub
  WHERE spm.id = sub.payment_method_id;

  -- Delete settlement items
  DELETE FROM payment_gateway_settlement_items WHERE settlement_id = p_settlement_id;

  -- Mark settlement as REVERSED
  UPDATE payment_gateway_settlements
  SET status = 'REVERSED', updated_at = now()
  WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement.settlement_batch_id,
    'reversed_amount', v_settlement.net_amount,
    'restored_count', v_restored_count
  );
END;
$$;
