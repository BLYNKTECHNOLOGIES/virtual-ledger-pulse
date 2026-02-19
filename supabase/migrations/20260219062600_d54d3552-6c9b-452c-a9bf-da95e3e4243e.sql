
-- Fix all Binance Pay entries in erp_action_queue:
-- 1. Correct movement_type from deposit → withdrawal for negative amounts
-- 2. Fix amount to be positive (absolute value)
UPDATE erp_action_queue
SET 
  movement_type = CASE 
    WHEN amount < 0 THEN 'withdrawal'
    ELSE 'deposit'
  END,
  amount = ABS(amount)
WHERE network = 'Binance Pay';
