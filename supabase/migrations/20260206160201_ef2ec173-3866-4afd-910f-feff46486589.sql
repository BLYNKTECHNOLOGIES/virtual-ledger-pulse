
-- Clean up stale pending_settlements that have already been settled
DELETE FROM pending_settlements
WHERE sales_order_id IN (
  SELECT sales_order_id FROM payment_gateway_settlement_items
);

-- Fix the RPC: reset payment method usage BEFORE deleting pending settlements
CREATE OR REPLACE FUNCTION public.process_payment_gateway_settlement(
  p_pending_settlement_ids uuid[],
  p_bank_account_id uuid,
  p_mdr_amount numeric DEFAULT 0,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- Lock and verify all pending settlements are still PENDING
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

  -- Create settlement record
  INSERT INTO payment_gateway_settlements (
    settlement_batch_id, bank_account_id, total_amount, mdr_amount, net_amount, mdr_rate, settlement_date
  ) VALUES (
    v_settlement_batch_id, p_bank_account_id, v_total_amount, p_mdr_amount, v_net_amount, v_mdr_rate, CURRENT_DATE
  ) RETURNING id INTO v_settlement_id;

  -- Create settlement items
  INSERT INTO payment_gateway_settlement_items (settlement_id, sales_order_id, amount)
  SELECT v_settlement_id, (item->>'sales_order_id')::uuid, (item->>'amount')::numeric
  FROM unnest(v_settlement_items) AS item;

  -- Create bank transaction (INCOME)
  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number, created_by
  ) VALUES (
    p_bank_account_id, 'INCOME', v_net_amount,
    'Payment Gateway Settlement - ' || array_length(v_valid_ids, 1) || ' sale(s)' ||
      CASE WHEN p_mdr_amount > 0 THEN ' (Net after MDR: ₹' || p_mdr_amount::text || ')' ELSE '' END,
    CURRENT_DATE, 'Settlement', v_settlement_batch_id, p_created_by
  );

  -- Create MDR expense if applicable
  IF p_mdr_amount > 0 THEN
    INSERT INTO bank_transactions (
      bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number, created_by
    ) VALUES (
      p_bank_account_id, 'EXPENSE', p_mdr_amount,
      'MDR / Payment Gateway Fees - Settlement ' || v_settlement_batch_id || ' (' || array_length(v_valid_ids, 1) || ' transactions)',
      CURRENT_DATE, 'MDR / payment gateway fees', 'MDR-' || v_settlement_batch_id, p_created_by
    );
  END IF;

  -- Reset payment method usage BEFORE deleting (must read from pending_settlements first)
  UPDATE sales_payment_methods spm
  SET current_usage = GREATEST(0, spm.current_usage - sub.settled_total)
  FROM (
    SELECT ps.payment_method_id, SUM(ps.total_amount) AS settled_total
    FROM pending_settlements ps
    WHERE ps.id = ANY(v_valid_ids) AND ps.payment_method_id IS NOT NULL
    GROUP BY ps.payment_method_id
  ) sub
  WHERE spm.id = sub.payment_method_id;

  -- Now delete the pending settlements
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
