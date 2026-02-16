
-- Resync wallet_asset_balances from ledger (source of truth)
UPDATE wallet_asset_balances wab
SET balance = ledger.net,
    total_received = ledger.total_in,
    total_sent = ledger.total_out,
    updated_at = now()
FROM (
  SELECT wallet_id, asset_code,
    SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE 0 END) as total_in,
    SUM(CASE WHEN transaction_type IN ('DEBIT','TRANSFER_OUT') THEN amount ELSE 0 END) as total_out,
    SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount 
             WHEN transaction_type IN ('DEBIT','TRANSFER_OUT') THEN -amount ELSE 0 END) as net
  FROM wallet_transactions
  GROUP BY wallet_id, asset_code
) ledger
WHERE wab.wallet_id = ledger.wallet_id AND wab.asset_code = ledger.asset_code;

-- Also resync wallets.current_balance for USDT from ledger
UPDATE wallets w
SET current_balance = COALESCE(ledger.net, 0),
    total_received = COALESCE(ledger.total_in, 0),
    total_sent = COALESCE(ledger.total_out, 0),
    updated_at = now()
FROM (
  SELECT wallet_id,
    SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE 0 END) as total_in,
    SUM(CASE WHEN transaction_type IN ('DEBIT','TRANSFER_OUT') THEN amount ELSE 0 END) as total_out,
    SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount 
             WHEN transaction_type IN ('DEBIT','TRANSFER_OUT') THEN -amount ELSE 0 END) as net
  FROM wallet_transactions
  WHERE asset_code = 'USDT'
  GROUP BY wallet_id
) ledger
WHERE w.id = ledger.wallet_id;

-- Insert missing wallet_asset_balances rows for wallets that have ledger entries but no row
INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
SELECT ledger.wallet_id, ledger.asset_code, ledger.net, ledger.total_in, ledger.total_out
FROM (
  SELECT wallet_id, asset_code,
    SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE 0 END) as total_in,
    SUM(CASE WHEN transaction_type IN ('DEBIT','TRANSFER_OUT') THEN amount ELSE 0 END) as total_out,
    SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount 
             WHEN transaction_type IN ('DEBIT','TRANSFER_OUT') THEN -amount ELSE 0 END) as net
  FROM wallet_transactions
  GROUP BY wallet_id, asset_code
) ledger
LEFT JOIN wallet_asset_balances wab ON wab.wallet_id = ledger.wallet_id AND wab.asset_code = ledger.asset_code
WHERE wab.wallet_id IS NULL
ON CONFLICT (wallet_id, asset_code) DO NOTHING;
