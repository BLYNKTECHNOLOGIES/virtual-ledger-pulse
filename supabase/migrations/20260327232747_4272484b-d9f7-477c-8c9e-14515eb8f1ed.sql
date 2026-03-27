-- Backfill fee_amount (INR) from fee_usdt_amount * average_buying_price for records where it's 0
-- This is a reporting column fix, not a revenue fix (fees were already deducted via wallet_transactions)
UPDATE wallet_fee_deductions
SET fee_amount = fee_usdt_amount * COALESCE(NULLIF(average_buying_price, 0), usdt_rate_used)
WHERE fee_percentage > 0 AND fee_amount = 0 AND fee_usdt_amount > 0;