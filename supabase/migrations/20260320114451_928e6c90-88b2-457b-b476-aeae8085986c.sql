-- Fix IDBI bank balance to match physical bank balance (374729.92)
-- Drift of 48494.20 caused by double-credit of sales order OFS000462

-- 1. Correct the balance column to physical truth
UPDATE bank_accounts
SET balance = 374729.92,
    updated_at = now()
WHERE id = '24465cfe-e685-4e9c-b441-a3adcc203768';

-- 2. Insert adjustment ledger entry to document the correction
INSERT INTO bank_transactions (
  bank_account_id, transaction_type, amount, description, category, reference_number, transaction_date
) VALUES (
  '24465cfe-e685-4e9c-b441-a3adcc203768',
  'EXPENSE',
  48494.20,
  'Balance correction: double-credit reversal for OFS000462 (Shaan Hyder). Physical balance verified at 374729.92',
  'Losses, Adjustments & Exceptions > Balance adjustments',
  'ADJ-IDBI-OFS000462-FIX',
  now()::date
);