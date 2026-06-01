DO $$
DECLARE
  v_po_id uuid := 'c848d1aa-f235-4e80-b1bf-6a9433095c43';
  v_bad_tx uuid := 'b5b0f353-3418-4348-aa38-5329fe072542';
  v_wallet uuid := '5f3c35a8-468d-4ada-b9d6-d9fb1867470f';
  v_actor uuid := 'e00015eb-53c7-4be0-a9b9-e7c1cdd1acfd';
BEGIN
  -- 1) Reverse the phantom BTC credit (canonical, idempotent reversal)
  PERFORM public.reverse_wallet_transaction(
    v_bad_tx,
    'Asset mis-booked as BTC; purchase order 6a1975cc2aecff0001572803 (DEV DUTT) is USDT — correcting asset',
    v_actor
  );

  -- 2) Book the correct USDT credit for the same purchase order
  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, amount,
    reference_type, reference_id, description,
    created_by, asset_code,
    market_rate_usdt, effective_usdt_qty, effective_usdt_rate
  ) VALUES (
    v_wallet, 'CREDIT', 119.316,
    'PURCHASE_ORDER', v_po_id,
    'Manual Purchase - 6a1975cc2aecff0001572803 (DEV DUTT) — asset corrected to USDT',
    v_actor, 'USDT',
    1, 119.316, 1
  );
END $$;