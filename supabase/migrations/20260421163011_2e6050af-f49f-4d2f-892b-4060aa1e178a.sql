DO $$
DECLARE
  blynk_wallet uuid := '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';
  adj_wallet uuid := '1ef0342f-b0ee-41c5-b3c1-8f589696ad0b';
  rec record;
  opposite_type text;
  c1_count int := 0;
  c2_count int := 0;
BEGIN
  -- PASS 1: CREDIT mirrors to adj_wallet
  FOR rec IN
    SELECT id, transaction_type, amount, reference_type
    FROM wallet_transactions
    WHERE wallet_id = blynk_wallet AND asset_code = 'USDT'
      AND reference_type IN ('MANUAL_ADJUSTMENT','OPENING_BALANCE')
      AND transaction_type = 'CREDIT'
    ORDER BY created_at
  LOOP
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, reference_type, reference_id, description)
    SELECT adj_wallet, 'CREDIT', rec.amount, 'USDT', 'RECONCILIATION', rec.id,
           'Reconciliation: mirror of misplaced ' || rec.reference_type || ' originally on BINANCE BLYNK (Migration 2 Part C.1)'
    WHERE NOT EXISTS (
      SELECT 1 FROM wallet_transactions
      WHERE reference_type = 'RECONCILIATION' AND reference_id = rec.id
        AND wallet_id = adj_wallet AND asset_code = 'USDT' AND transaction_type = 'CREDIT'
    );
  END LOOP;

  -- PASS 2: DEBIT mirrors to adj_wallet
  FOR rec IN
    SELECT id, transaction_type, amount, reference_type
    FROM wallet_transactions
    WHERE wallet_id = blynk_wallet AND asset_code = 'USDT'
      AND reference_type IN ('MANUAL_ADJUSTMENT','OPENING_BALANCE')
      AND transaction_type = 'DEBIT'
    ORDER BY created_at
  LOOP
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, reference_type, reference_id, description)
    SELECT adj_wallet, 'DEBIT', rec.amount, 'USDT', 'RECONCILIATION', rec.id,
           'Reconciliation: mirror of misplaced ' || rec.reference_type || ' originally on BINANCE BLYNK (Migration 2 Part C.1)'
    WHERE NOT EXISTS (
      SELECT 1 FROM wallet_transactions
      WHERE reference_type = 'RECONCILIATION' AND reference_id = rec.id
        AND wallet_id = adj_wallet AND asset_code = 'USDT' AND transaction_type = 'DEBIT'
    );
  END LOOP;

  -- PASS 3: opposite-direction reversals on BLYNK
  FOR rec IN
    SELECT id, transaction_type, amount, reference_type
    FROM wallet_transactions
    WHERE wallet_id = blynk_wallet AND asset_code = 'USDT'
      AND reference_type IN ('MANUAL_ADJUSTMENT','OPENING_BALANCE')
    ORDER BY (CASE WHEN transaction_type = 'DEBIT' THEN 0 ELSE 1 END), created_at
  LOOP
    opposite_type := CASE WHEN rec.transaction_type = 'CREDIT' THEN 'DEBIT' ELSE 'CREDIT' END;
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, reference_type, reference_id, description)
    SELECT blynk_wallet, opposite_type, rec.amount, 'USDT', 'RECONCILIATION', rec.id,
           'Reconciliation: relocate misplaced ' || rec.reference_type || ' from BINANCE BLYNK to Balance Adjustment Wallet (Migration 2 Part C.1)'
    WHERE NOT EXISTS (
      SELECT 1 FROM wallet_transactions
      WHERE reference_type = 'RECONCILIATION' AND reference_id = rec.id
        AND wallet_id = blynk_wallet AND asset_code = 'USDT' AND transaction_type = opposite_type
    );
    c1_count := c1_count + 1;
  END LOOP;

  -- C.2 USDT-ONLY: credit missing USDT for 4 multi-fill conversions (asset DEBITs SKIPPED; see audit notes)
  FOR rec IN
    SELECT * FROM (VALUES
      ('151a4f61-b801-4019-ba5f-887762646f78'::uuid, 'CONV-20260217-007', 'BNB', 1344.47::numeric),
      ('58885bf9-9f01-49ce-9dd7-3c6d86bd1ff8'::uuid, 'CONV-20260416-001', 'BNB', 147.68::numeric),
      ('49714b6c-9460-4f93-baad-7c394ada15c9'::uuid, 'CONV-20260216-016', 'BTC', 50.19::numeric),
      ('1a5ac163-8ded-48bd-9966-9ac357ea0413'::uuid, 'CONV-20260217-006', 'BTC', 75.22::numeric)
    ) AS t(conv_id, ref_no, asset, usdt_delta)
  LOOP
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, reference_type, reference_id, description)
    SELECT blynk_wallet, 'CREDIT', rec.usdt_delta, 'USDT', 'RECONCILIATION', rec.conv_id,
           'Reconciliation: under-credited USDT on multi-fill conversion ' || rec.ref_no || ' (asset ' || rec.asset || ' DEBIT skipped pending phantom-outflow forensic) (Migration 2 Part C.2 USDT-only)'
    WHERE NOT EXISTS (
      SELECT 1 FROM wallet_transactions
      WHERE reference_type = 'RECONCILIATION' AND reference_id = rec.conv_id
        AND wallet_id = blynk_wallet AND asset_code = 'USDT' AND transaction_type = 'CREDIT'
    );
    c2_count := c2_count + 1;
  END LOOP;

  INSERT INTO adjustment_posting_audit (wallet_id, wallet_name, transaction_type, amount, asset_code, reference_type, description, notes)
  VALUES (blynk_wallet, 'BINANCE BLYNK', 'BATCH', 0, 'USDT', 'RECONCILIATION',
          'Migration 2 Part C executed (Option A: USDT-only C.2)',
          'C.1 processed ' || c1_count || ' misplaced rows; C.2 USDT-only credits posted for ' || c2_count || ' multi-fill conversions. Asset DEBITs deferred — BNB/BTC inventory already moved out of BLYNK; requires phantom-outflow forensic.');
END $$;