-- Alter wallet_fee_deductions table to support USDT-based fee deductions
ALTER TABLE public.wallet_fee_deductions 
ADD COLUMN IF NOT EXISTS fee_usdt_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS usdt_rate_used numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_buying_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_inr_value_at_buying_price numeric DEFAULT 0;

-- Add comments for clarity
COMMENT ON COLUMN public.wallet_fee_deductions.fee_usdt_amount IS 'The fee amount deducted in USDT';
COMMENT ON COLUMN public.wallet_fee_deductions.usdt_rate_used IS 'The live USDT/INR rate used at the time of calculation';
COMMENT ON COLUMN public.wallet_fee_deductions.average_buying_price IS 'The average buying price of USDT at the time of deduction';
COMMENT ON COLUMN public.wallet_fee_deductions.fee_inr_value_at_buying_price IS 'Fee value in INR calculated using average buying price (for accounting)';