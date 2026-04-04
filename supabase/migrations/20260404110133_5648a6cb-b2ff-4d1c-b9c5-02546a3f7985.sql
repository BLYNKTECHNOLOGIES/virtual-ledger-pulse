CREATE OR REPLACE FUNCTION public.reverse_payment_gateway_settlement(p_settlement_id uuid, p_reversed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_settlement record;
  v_item record;
  v_guard_inserted boolean;
  v_restored_count int := 0;
BEGIN
  INSERT INTO reversal_guards (entity_type, entity_id, action)
  VALUES ('payment_gateway_settlement', p_settlement_id, 'reverse')
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_guard_inserted;

  IF v_guard_inserted IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This settlement has already been reversed or is currently being reversed.'
    );
  END IF;

  SELECT * INTO v_settlement
  FROM payment_gateway_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF v_settlement IS NULL THEN
    DELETE FROM reversal_guards WHERE entity_type = 'payment_gateway_settlement' AND entity_id = p_settlement_id AND action = 'reverse';
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found.');
  END IF;

  IF v_settlement.status = 'REVERSED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement is already reversed.');
  END IF;

  FOR v_item IN
    SELECT si.sales_order_id, si.amount,
           so.order_number, so.client_name, so.order_date,
           so.sales_payment_method_id
    FROM payment_gateway_settlement_items si
    JOIN sales_orders so ON so.id = si.sales_order_id
    WHERE si.settlement_id = p_settlement_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items other_si
      JOIN payment_gateway_settlements other_pgs ON other_pgs.id = other_si.settlement_id
      WHERE other_si.sales_order_id = v_item.sales_order_id
        AND other_pgs.id != p_settlement_id
        AND other_pgs.status = 'COMPLETED'
    ) THEN
      -- Insert pending settlement with payment_method_id to satisfy unique constraint
      INSERT INTO pending_settlements (
        sales_order_id, order_number, client_name, total_amount, settlement_amount,
        order_date, payment_method_id, bank_account_id, status
      )
      VALUES (
        v_item.sales_order_id, v_item.order_number, v_item.client_name,
        v_item.amount, v_item.amount, v_item.order_date,
        v_item.sales_payment_method_id, v_settlement.bank_account_id, 'PENDING'
      )
      ON CONFLICT (sales_order_id, payment_method_id) DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        settlement_amount = EXCLUDED.settlement_amount,
        bank_account_id = EXCLUDED.bank_account_id,
        status = 'PENDING',
        updated_at = now();

      UPDATE sales_orders
      SET settlement_status = 'PENDING'
      WHERE id = v_item.sales_order_id AND settlement_status = 'SETTLED';
    END IF;

    v_restored_count := v_restored_count + 1;
  END LOOP;

  DELETE FROM bank_transactions
  WHERE reference_number = v_settlement.settlement_batch_id
    AND transaction_type = 'INCOME';

  DELETE FROM bank_transactions
  WHERE reference_number = 'MDR-' || v_settlement.settlement_batch_id
    AND transaction_type = 'EXPENSE';

  -- SOFT-MARK items as reversed instead of deleting (preserves audit trail)
  UPDATE payment_gateway_settlement_items 
  SET reversed_at = now()
  WHERE settlement_id = p_settlement_id;

  UPDATE payment_gateway_settlements
  SET status = 'REVERSED', updated_at = now(), reversed_by = p_reversed_by
  WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement.settlement_batch_id,
    'reversed_amount', v_settlement.net_amount,
    'restored_count', v_restored_count
  );
END;
$function$;