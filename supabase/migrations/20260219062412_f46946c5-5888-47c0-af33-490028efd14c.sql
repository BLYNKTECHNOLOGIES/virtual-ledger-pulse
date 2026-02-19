
-- Fix all Binance Pay records that were incorrectly classified:
-- 1. Negative amount + movement_type=deposit => should be withdrawal with abs(amount)
-- 2. Positive amount + movement_type=withdrawal => should be deposit (in case any exist)

UPDATE asset_movement_history
SET 
  movement_type = CASE 
    WHEN (raw_data->>'amount')::float < 0 THEN 'withdrawal'
    ELSE 'deposit'
  END,
  amount = ABS(amount)
WHERE id LIKE 'pay-%';
