-- Manual baseline reset to zero using ledger-safe offset entries.
-- Baseline requested by user: 23-May-2026 17:10 IST.
-- This does NOT touch pending_settlements, tax/TDS holdings, orders, or payment splits.

INSERT INTO public.wallet_transactions (
  wallet_id,
  transaction_type,
  amount,
  reference_type,
  description,
  asset_code,
  created_at,
  created_by
)
SELECT
  wab.wallet_id,
  CASE WHEN wab.balance > 0 THEN 'DEBIT' ELSE 'CREDIT' END,
  ABS(wab.balance),
  'OPENING_BALANCE_ADJUSTMENT',
  'Manual baseline reset to zero - 23-May-2026 17:10 IST',
  wab.asset_code,
  TIMESTAMPTZ '2026-05-23 17:10:00+05:30',
  NULL
FROM public.wallet_asset_balances wab
WHERE COALESCE(wab.balance, 0) <> 0;

INSERT INTO public.bank_transactions (
  bank_account_id,
  transaction_type,
  amount,
  category,
  description,
  reference_number,
  transaction_date,
  created_at,
  created_by
)
SELECT
  ba.id,
  CASE WHEN ba.balance > 0 THEN 'EXPENSE' ELSE 'INCOME' END,
  ABS(ba.balance),
  'Manual Baseline Reset',
  'Manual baseline reset to zero - 23-May-2026 17:10 IST',
  'BASELINE-RESET-20260523-1710-' || ba.id::text,
  DATE '2026-05-23',
  TIMESTAMPTZ '2026-05-23 17:10:00+05:30',
  NULL
FROM public.bank_accounts ba
WHERE COALESCE(ba.balance, 0) <> 0;

-- Products are cache/display stock and were already allowed to be set directly.
UPDATE public.products
SET current_stock_quantity = 0,
    updated_at = now()
WHERE COALESCE(current_stock_quantity, 0) <> 0;