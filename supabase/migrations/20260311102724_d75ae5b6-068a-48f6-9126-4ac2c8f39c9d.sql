
-- Reconcile ALL wallet_asset_balances from the transaction ledger (SUM-based truth)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT 
      wallet_id,
      asset_code,
      COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
                        WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
                        ELSE 0 END), 0) AS calc_balance,
      COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount ELSE 0 END), 0) AS calc_received,
      COALESCE(SUM(CASE WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN amount ELSE 0 END), 0) AS calc_sent
    FROM wallet_transactions 
    GROUP BY wallet_id, asset_code
  LOOP
    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (r.wallet_id, r.asset_code, r.calc_balance, r.calc_received, r.calc_sent)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = r.calc_balance,
      total_received = r.calc_received,
      total_sent = r.calc_sent,
      updated_at = now();
  END LOOP;
END;
$$;
