-- Grant necessary permissions for recalculate function
-- The function needs SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.recalculate_wallet_balance(wallet_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  usdt_balance NUMERIC := 0;
  usdt_received NUMERIC := 0;
  usdt_sent NUMERIC := 0;
BEGIN
  FOR r IN
    SELECT 
      asset_code,
      COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
                        WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
                        ELSE 0 END), 0) AS calc_balance,
      COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount ELSE 0 END), 0) AS calc_received,
      COALESCE(SUM(CASE WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN amount ELSE 0 END), 0) AS calc_sent
    FROM wallet_transactions 
    WHERE wallet_id = wallet_id_param
    GROUP BY asset_code
  LOOP
    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (wallet_id_param, r.asset_code, r.calc_balance, r.calc_received, r.calc_sent)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = r.calc_balance,
      total_received = r.calc_received,
      total_sent = r.calc_sent,
      updated_at = now();

    IF r.asset_code = 'USDT' THEN
      usdt_balance := r.calc_balance;
      usdt_received := r.calc_received;
      usdt_sent := r.calc_sent;
    END IF;
  END LOOP;
  
  UPDATE wallets 
  SET current_balance = usdt_balance,
      total_received = usdt_received,
      total_sent = usdt_sent,
      updated_at = now()
  WHERE id = wallet_id_param;
END;
$$;

-- Now recalculate all active wallets
DO $$
DECLARE
  w RECORD;
BEGIN
  FOR w IN SELECT id FROM wallets WHERE is_active = true
  LOOP
    PERFORM recalculate_wallet_balance(w.id);
  END LOOP;
END;
$$;