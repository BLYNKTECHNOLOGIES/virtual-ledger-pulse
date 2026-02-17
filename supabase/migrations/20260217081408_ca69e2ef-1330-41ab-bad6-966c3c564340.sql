
-- Add corrective CREDIT to zero out the -168991 SHIB balance
INSERT INTO wallet_transactions (
  wallet_id, transaction_type, amount, asset_code,
  reference_type, description,
  balance_before, balance_after, created_by
)
VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'CREDIT',
  168991,
  'SHIB',
  'RECONCILIATION',
  'Corrective credit to zero out negative SHIB balance caused by over-debit',
  0, 0, -- trigger will set actual values
  NULL
);
