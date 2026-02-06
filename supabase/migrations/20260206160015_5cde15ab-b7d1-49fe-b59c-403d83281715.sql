
-- Fix missing bank transaction for settlement PGS-1770358107038
-- This settlement's bank transaction was lost during cleanup
INSERT INTO bank_transactions (
  bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number
)
SELECT 
  s.bank_account_id, 'INCOME', s.net_amount,
  'Payment Gateway Settlement - ' || (SELECT COUNT(*) FROM payment_gateway_settlement_items WHERE settlement_id = s.id) || ' sale(s)',
  s.settlement_date::date, 'Settlement', s.settlement_batch_id
FROM payment_gateway_settlements s
WHERE s.settlement_batch_id = 'PGS-1770358107038'
  AND NOT EXISTS (
    SELECT 1 FROM bank_transactions bt WHERE bt.reference_number = s.settlement_batch_id
  );
