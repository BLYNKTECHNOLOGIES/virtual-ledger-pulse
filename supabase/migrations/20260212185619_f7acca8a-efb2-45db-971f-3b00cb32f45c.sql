
-- Update the opening balance entry to the correct amount
UPDATE public.wallet_transactions
SET amount = 1463.46,
    description = 'Opening balance: unrecorded initial USDT funding prior to ledger tracking'
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND asset_code = 'USDT'
  AND reference_type = 'OPENING_BALANCE';

-- Full ledger replay
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
END $$;
