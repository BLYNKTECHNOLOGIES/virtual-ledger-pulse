-- 1. Fix the function: credit GROSS amount as INCOME, keep MDR as separate EXPENSE
CREATE OR REPLACE FUNCTION public.process_payment_gateway_settlement(p_pending_settlement_ids uuid[], p_bank_account_id uuid, p_mdr_amount numeric DEFAULT 0, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_amount numeric := 0;
  v_net_amount numeric;
  v_mdr_rate numeric;
  v_settlement_batch_id text;
  v_settlement_id uuid;
  v_pending_record record;
  v_valid_ids uuid[] := '{}';
  v_settled_order_ids uuid[] := '{}';
  v_settlement_items jsonb[] := '{}';
  v_skipped_count int := 0;
BEGIN
  FOR v_pending_record IN
    SELECT id, sales_order_id, total_amount, payment_method_id
    FROM pending_settlements
    WHERE id = ANY(p_pending_settlement_ids)
      AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items pgsi
      JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
      WHERE pgsi.sales_order_id = v_pending_record.sales_order_id
        AND pgs.status = 'COMPLETED'
    ) THEN
      DELETE FROM pending_settlements WHERE id = v_pending_record.id;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_valid_ids := array_append(v_valid_ids, v_pending_record.id);
    v_settled_order_ids := array_append(v_settled_order_ids, v_pending_record.sales_order_id);
    v_total_amount := v_total_amount + v_pending_record.total_amount;
    v_settlement_items := array_append(v_settlement_items, jsonb_build_object(
      'sales_order_id', v_pending_record.sales_order_id,
      'amount', v_pending_record.total_amount
    ));
  END LOOP;

  IF array_length(v_valid_ids, 1) IS NULL OR array_length(v_valid_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', CASE WHEN v_skipped_count > 0
        THEN v_skipped_count || ' order(s) were already settled in other batches and have been cleaned up. Please refresh and try again.'
        ELSE 'No valid pending settlements found. They may have already been settled.'
      END
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

  -- FIX: Credit GROSS amount as INCOME (the gateway settles gross to bank in accounting terms)
  -- and post MDR separately as an EXPENSE so the net balance impact equals (gross - mdr) only ONCE.
  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number, created_by
  ) VALUES (
    p_bank_account_id, 'INCOME', v_total_amount,
    'Payment Gateway Settlement - ' || array_length(v_valid_ids, 1) || ' sale(s)' ||
      CASE WHEN p_mdr_amount > 0 THEN ' (Gross: ₹' || v_total_amount::text || ', MDR: ₹' || p_mdr_amount::text || ', Net: ₹' || v_net_amount::text || ')' ELSE '' END,
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

  DELETE FROM pending_settlements WHERE id = ANY(v_valid_ids);

  UPDATE sales_orders
  SET settlement_status = 'SETTLED',
      settled_at = now(),
      settlement_batch_id = v_settlement_batch_id
  WHERE id = ANY(v_settled_order_ids);

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement_batch_id,
    'settlement_id', v_settlement_id,
    'total_amount', v_total_amount,
    'mdr_amount', p_mdr_amount,
    'net_amount', v_net_amount,
    'settled_count', array_length(v_valid_ids, 1),
    'skipped_duplicates', v_skipped_count
  );
END;
$function$;

-- 2. Reconcile historical settlements: bump INCOME entries that were posted as net up to gross.
-- Identify INCOME rows whose amount equals net_amount of a COMPLETED settlement with mdr > 0,
-- and increase them to total_amount so the double-deduction is undone.
UPDATE bank_transactions bt
SET amount = pgs.total_amount,
    description = 'Payment Gateway Settlement - reconciled (Gross: ₹' || pgs.total_amount::text || ', MDR: ₹' || pgs.mdr_amount::text || ', Net: ₹' || pgs.net_amount::text || ')'
FROM payment_gateway_settlements pgs
WHERE bt.reference_number = pgs.settlement_batch_id
  AND bt.transaction_type = 'INCOME'
  AND pgs.status = 'COMPLETED'
  AND pgs.mdr_amount > 0
  AND bt.amount = pgs.net_amount;