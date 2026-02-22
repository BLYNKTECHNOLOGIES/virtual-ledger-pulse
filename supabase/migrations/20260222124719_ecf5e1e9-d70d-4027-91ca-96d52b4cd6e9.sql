
-- REVERSE XRP Reconciliation for CONV-20260222-006
UPDATE erp_product_conversions SET
  actual_usdt_received = NULL,
  net_usdt_change = 2327.09289768,
  gross_usd_value = 2327.09289768,
  price_usd = 2327.09289768 / 1650.2,
  execution_rate_usdt = 2327.09289768 / 1650.2,
  realized_pnl_usdt = 2327.09289768,
  binance_transfer_id = NULL,
  rate_reconciled_at = NULL,
  rate_reconciled_by = NULL,
  metadata = NULL
WHERE id = 'f4929cfb-7249-4d0b-ab80-1d01a3c6efe2';

UPDATE conversion_journal_entries SET
  usdt_delta = 2329.42232,
  notes = 'USDT received from SELL'
WHERE conversion_id = 'f4929cfb-7249-4d0b-ab80-1d01a3c6efe2' AND line_type = 'USDT_IN';

UPDATE conversion_journal_entries SET
  usdt_delta = 2327.09289768,
  notes = 'Realized P&L'
WHERE conversion_id = 'f4929cfb-7249-4d0b-ab80-1d01a3c6efe2' AND line_type = 'REALIZED_PNL';

UPDATE wallet_transactions SET
  amount = 2327.09289768,
  balance_after = balance_before + 2327.09289768,
  description = 'Conversion SELL: received USDT'
WHERE id = '2ad5200c-915d-4d2c-9e7b-0971e1347abd';

UPDATE wallets SET
  current_balance = current_balance + 791.25671124
WHERE id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';
