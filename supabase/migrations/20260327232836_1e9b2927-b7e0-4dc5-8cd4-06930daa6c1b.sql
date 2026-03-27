-- Backfill fee_amount (INR) for 237 records where average_buying_price and usdt_rate_used were both 0
-- Using gross_amount * fee_percentage / 100 which is the direct INR fee calculation
UPDATE wallet_fee_deductions
SET fee_amount = gross_amount * fee_percentage / 100
WHERE fee_percentage > 0 AND fee_amount = 0 AND fee_usdt_amount > 0;