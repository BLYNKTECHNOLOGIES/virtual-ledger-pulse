
-- Step 1: Delete the 14 individually-inserted reconciliation deductions 
DELETE FROM public.wallet_transactions
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND asset_code = 'USDT'
  AND reference_type = 'SALES_ORDER'
  AND description = 'USDT sold via sales order'
  AND reference_id IN (
    '76f2578d-0fe5-4cd4-a649-f3f25bc3bb4c','d74d9609-8e77-43bc-a7cf-f3e024169dd2',
    'f1d297f1-ca7d-422f-b4b4-73604226aab8','083ed2e8-441f-4801-9d93-17127825b490',
    'be8fa1e4-db89-4eb2-acd6-a08d8b6482aa','ef62804f-e089-4852-ba8d-73c4ccd6c090',
    'acb77d1e-a0be-4423-b136-c4321723d2fd','ec47fbd1-3961-4d58-9ee8-80a18993f0ec',
    '8340d878-5d04-4444-9785-49c9087c4ec0','86cf9873-03bb-4267-8dfc-878a0f2d2e5f',
    'a0af59a4-e0d4-410f-82d6-c08aa1baf63e','e7bb8663-77dc-4fec-ae17-37f9ccc72290',
    '9ecbaced-92e2-4de0-a1ed-8db09e2740eb','b09a48ca-1b07-4516-a373-16fc67b4fd5a'
  );

-- Step 2: Replay the ENTIRE USDT ledger to fix the balance chain (removes negatives)
DO $$
DECLARE
  running_balance NUMERIC := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, transaction_type, amount
    FROM public.wallet_transactions
    WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' 
      AND asset_code = 'USDT'
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE public.wallet_transactions
    SET balance_before = running_balance,
        balance_after = CASE 
          WHEN rec.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN running_balance + rec.amount
          WHEN rec.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN running_balance - rec.amount
          ELSE running_balance
        END
    WHERE id = rec.id;

    IF rec.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
      running_balance := running_balance + rec.amount;
    ELSIF rec.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
      running_balance := running_balance - rec.amount;
    END IF;
  END LOOP;

  -- Step 3: Now insert the 14 deductions as reconciliation entries at CURRENT time
  -- They'll go at the end of the ledger where balance is sufficient
  INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, asset_code, reference_type, reference_id, description, balance_before, balance_after, created_at)
  SELECT 
    so.wallet_id,
    'DEBIT',
    so.quantity,
    'USDT',
    'SALES_ORDER',
    so.id,
    'Reconciliation: USDT sold via sales order ' || so.order_number,
    running_balance,
    running_balance - so.quantity,
    now()
  FROM sales_orders so
  WHERE so.id = (
    SELECT s2.id FROM sales_orders s2 
    WHERE s2.id IN (
      '76f2578d-0fe5-4cd4-a649-f3f25bc3bb4c','d74d9609-8e77-43bc-a7cf-f3e024169dd2',
      'f1d297f1-ca7d-422f-b4b4-73604226aab8','083ed2e8-441f-4801-9d93-17127825b490',
      'be8fa1e4-db89-4eb2-acd6-a08d8b6482aa','ef62804f-e089-4852-ba8d-73c4ccd6c090',
      'acb77d1e-a0be-4423-b136-c4321723d2fd','ec47fbd1-3961-4d58-9ee8-80a18993f0ec',
      '8340d878-5d04-4444-9785-49c9087c4ec0','86cf9873-03bb-4267-8dfc-878a0f2d2e5f',
      'a0af59a4-e0d4-410f-82d6-c08aa1baf63e','e7bb8663-77dc-4fec-ae17-37f9ccc72290',
      '9ecbaced-92e2-4de0-a1ed-8db09e2740eb','b09a48ca-1b07-4516-a373-16fc67b4fd5a'
    )
    AND s2.id = so.id
    ORDER BY s2.created_at ASC
    LIMIT 1
  );
  -- The above only inserts one row due to correlated subquery issue. Let me use a different approach.
END $$;

-- Better approach: delete and re-do everything cleanly
-- Step 2b: Delete any partial inserts from above block
DELETE FROM public.wallet_transactions
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND asset_code = 'USDT'
  AND description LIKE 'Reconciliation: USDT sold via sales order%';

-- Step 3: Insert all 14 as reconciliation entries with NOW() timestamp
INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, asset_code, reference_type, reference_id, description, balance_before, balance_after, created_at)
SELECT 
  so.wallet_id,
  'DEBIT',
  so.quantity,
  'USDT',
  'SALES_ORDER',
  so.id,
  'Reconciliation: USDT sold via ' || so.order_number,
  0, 0, -- trigger will override
  now()
FROM sales_orders so
WHERE so.status = 'COMPLETED' 
  AND so.wallet_id IS NOT NULL
  AND so.id IN (
    '76f2578d-0fe5-4cd4-a649-f3f25bc3bb4c','d74d9609-8e77-43bc-a7cf-f3e024169dd2',
    'f1d297f1-ca7d-422f-b4b4-73604226aab8','083ed2e8-441f-4801-9d93-17127825b490',
    'be8fa1e4-db89-4eb2-acd6-a08d8b6482aa','ef62804f-e089-4852-ba8d-73c4ccd6c090',
    'acb77d1e-a0be-4423-b136-c4321723d2fd','ec47fbd1-3961-4d58-9ee8-80a18993f0ec',
    '8340d878-5d04-4444-9785-49c9087c4ec0','86cf9873-03bb-4267-8dfc-878a0f2d2e5f',
    'a0af59a4-e0d4-410f-82d6-c08aa1baf63e','e7bb8663-77dc-4fec-ae17-37f9ccc72290',
    '9ecbaced-92e2-4de0-a1ed-8db09e2740eb','b09a48ca-1b07-4516-a373-16fc67b4fd5a'
  );

-- Step 4: Final full replay to fix all balance_before/after chains
DO $$
DECLARE
  running_balance NUMERIC := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, transaction_type, amount
    FROM public.wallet_transactions
    WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' 
      AND asset_code = 'USDT'
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE public.wallet_transactions
    SET balance_before = running_balance,
        balance_after = CASE 
          WHEN rec.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN running_balance + rec.amount
          WHEN rec.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN running_balance - rec.amount
          ELSE running_balance
        END
    WHERE id = rec.id;

    IF rec.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
      running_balance := running_balance + rec.amount;
    ELSIF rec.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
      running_balance := running_balance - rec.amount;
    END IF;
  END LOOP;

  -- Sync final balance
  UPDATE public.wallet_asset_balances
  SET balance = running_balance, updated_at = now()
  WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT';

  UPDATE public.wallets
  SET current_balance = running_balance, updated_at = now()
  WHERE id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';

  RAISE NOTICE 'Final replayed balance: %', running_balance;
END $$;
