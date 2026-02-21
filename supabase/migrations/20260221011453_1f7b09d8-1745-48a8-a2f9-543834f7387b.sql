-- Add settled_by and reversed_by columns
ALTER TABLE payment_gateway_settlements
  ADD COLUMN IF NOT EXISTS settled_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public.users(id);

-- Update settle RPC to accept and store settled_by
CREATE OR REPLACE FUNCTION process_payment_gateway_settlement(
  p_pending_settlement_ids uuid[],
  p_bank_account_id uuid,
  p_mdr_amount numeric DEFAULT 0,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_amount numeric := 0;
  v_net_amount numeric;
  v_mdr_rate numeric;
  v_settlement_batch_id text;
  v_settlement_id uuid;
  v_pending_record record;
  v_valid_ids uuid[] := '{}';
  v_settlement_items jsonb[] := '{}';
BEGIN
  FOR v_pending_record IN
    SELECT id, sales_order_id, total_amount, payment_method_id
    FROM pending_settlements
    WHERE id = ANY(p_pending_settlement_ids)
      AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_valid_ids := array_append(v_valid_ids, v_pending_record.id);
    v_total_amount := v_total_amount + v_pending_record.total_amount;
    v_settlement_items := array_append(v_settlement_items, jsonb_build_object(
      'sales_order_id', v_pending_record.sales_order_id,
      'amount', v_pending_record.total_amount
    ));
  END LOOP;

  IF array_length(v_valid_ids, 1) IS NULL OR array_length(v_valid_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No valid pending settlements found. They may have already been settled.'
    );
  END IF;

  v_net_amount := v_total_amount - p_mdr_amount;
  v_mdr_rate := CASE WHEN v_total_amount > 0 THEN (p_mdr_amount / v_total_amount) * 100 ELSE 0 END;
  v_settlement_batch_id := 'PGS-' || (EXTRACT(EPOCH FROM now()) * 1000)::bigint::text;

  INSERT INTO payment_gateway_settlements (
    settlement_batch_id, bank_account_id, total_amount, mdr_amount, net_amount, mdr_rate, settlement_date, settled_by
  ) VALUES (
    v_settlement_batch_id, p_bank_account_id, v_total_amount, p_mdr_amount, v_net_amount, v_mdr_rate, CURRENT_DATE, p_created_by
  ) RETURNING id INTO v_settlement_id;

  INSERT INTO payment_gateway_settlement_items (settlement_id, sales_order_id, amount)
  SELECT v_settlement_id, (item->>'sales_order_id')::uuid, (item->>'amount')::numeric
  FROM unnest(v_settlement_items) AS item;

  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number, created_by
  ) VALUES (
    p_bank_account_id, 'INCOME', v_net_amount,
    'Payment Gateway Settlement - ' || array_length(v_valid_ids, 1) || ' sale(s)' ||
      CASE WHEN p_mdr_amount > 0 THEN ' (Net after MDR: ₹' || p_mdr_amount::text || ')' ELSE '' END,
    CURRENT_DATE, 'Settlement', v_settlement_batch_id, p_created_by
  );

  IF p_mdr_amount > 0 THEN
    INSERT INTO bank_transactions (
      bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number, created_by
    ) VALUES (
      p_bank_account_id, 'EXPENSE', p_mdr_amount,
      'MDR / Payment Gateway Fees - Settlement ' || v_settlement_batch_id || ' (' || array_length(v_valid_ids, 1) || ' transactions)',
      CURRENT_DATE, 'MDR / payment gateway fees', 'MDR-' || v_settlement_batch_id, p_created_by
    );
  END IF;

  UPDATE sales_payment_methods spm
  SET current_usage = GREATEST(0, spm.current_usage - sub.settled_total)
  FROM (
    SELECT ps.payment_method_id, SUM(ps.total_amount) AS settled_total
    FROM pending_settlements ps
    WHERE ps.id = ANY(v_valid_ids) AND ps.payment_method_id IS NOT NULL
    GROUP BY ps.payment_method_id
  ) sub
  WHERE spm.id = sub.payment_method_id;

  DELETE FROM pending_settlements WHERE id = ANY(v_valid_ids);

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement_batch_id,
    'settlement_id', v_settlement_id,
    'total_amount', v_total_amount,
    'mdr_amount', p_mdr_amount,
    'net_amount', v_net_amount,
    'settled_count', array_length(v_valid_ids, 1)
  );
END;
$$;

-- Update reverse RPC to accept and store reversed_by
CREATE OR REPLACE FUNCTION reverse_payment_gateway_settlement(
  p_settlement_id uuid,
  p_reversed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    INSERT INTO pending_settlements (
      sales_order_id, order_number, client_name, total_amount, settlement_amount,
      order_date, payment_method_id, bank_account_id, status
    )
    SELECT
      v_item.sales_order_id, v_item.order_number, v_item.client_name,
      v_item.amount, v_item.amount, v_item.order_date,
      v_item.sales_payment_method_id, v_settlement.bank_account_id, 'PENDING'
    WHERE NOT EXISTS (
      SELECT 1 FROM pending_settlements WHERE sales_order_id = v_item.sales_order_id
    );

    UPDATE sales_orders
    SET settlement_status = 'PENDING'
    WHERE id = v_item.sales_order_id AND settlement_status = 'SETTLED';

    v_restored_count := v_restored_count + 1;
  END LOOP;

  DELETE FROM bank_transactions
  WHERE reference_number = v_settlement.settlement_batch_id
    AND transaction_type = 'INCOME';

  DELETE FROM bank_transactions
  WHERE reference_number = 'MDR-' || v_settlement.settlement_batch_id
    AND transaction_type = 'EXPENSE';

  UPDATE sales_payment_methods spm
  SET current_usage = spm.current_usage + sub.restored_total
  FROM (
    SELECT so.sales_payment_method_id, SUM(si.amount) AS restored_total
    FROM payment_gateway_settlement_items si
    JOIN sales_orders so ON so.id = si.sales_order_id
    WHERE si.settlement_id = p_settlement_id AND so.sales_payment_method_id IS NOT NULL
    GROUP BY so.sales_payment_method_id
  ) sub
  WHERE spm.id = sub.sales_payment_method_id;

  DELETE FROM payment_gateway_settlement_items WHERE settlement_id = p_settlement_id;

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
$$;