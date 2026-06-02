DO $$
DECLARE
  v_actor uuid := 'e00015eb-53c7-4be0-a9b9-e7c1cdd1acfd';
  v_dup_orders uuid[] := ARRAY[
    '2975f048-51c4-4dc2-b9b5-afbebbf0fc1c',
    '11458919-2ba8-4af9-8565-96ddafee554d',
    'e1683be4-ee14-4986-bfba-5c65f85f66b3',
    '293eefdd-d5d8-4980-82b6-1a7c729e45cf',
    'cdceba85-0ab3-4431-8dab-a17e71052a57',
    '92e62390-be45-4acb-8f06-a4db0b7c4baf',
    '5339419e-5dd9-477c-97a3-fc5d19fcf50c'
  ]::uuid[];
  v_tx record;
BEGIN
  -- 1. Reverse each duplicate wallet DEBIT (restores stock), audit-safe
  FOR v_tx IN
    SELECT id
    FROM public.wallet_transactions
    WHERE reference_type = 'SALES_ORDER'
      AND reference_id = ANY(v_dup_orders)
      AND transaction_type = 'DEBIT'
      AND related_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_wallet_transaction(
      v_tx.id,
      'Phantom duplicate off-market sale from rapid double-submit; keeping only OFS001013',
      v_actor
    );
  END LOOP;

  -- 2. Remove duplicate pending settlements
  DELETE FROM public.pending_settlements
  WHERE sales_order_id = ANY(v_dup_orders);

  -- 3. Delete the duplicate sales order records
  DELETE FROM public.sales_orders
  WHERE id = ANY(v_dup_orders);
END $$;