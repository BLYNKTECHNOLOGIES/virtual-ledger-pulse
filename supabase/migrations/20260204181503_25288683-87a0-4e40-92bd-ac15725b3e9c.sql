-- Add payment_status column to tds_records for tracking TDS payment to government
ALTER TABLE public.tds_records 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID', 'UNPAID'));

-- Add payment tracking fields
ALTER TABLE public.tds_records 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS payment_bank_account_id UUID REFERENCES public.bank_accounts(id),
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS payment_batch_id TEXT;

-- Create index for faster quarter-based queries
CREATE INDEX IF NOT EXISTS idx_tds_records_deduction_date ON public.tds_records(deduction_date);
CREATE INDEX IF NOT EXISTS idx_tds_records_payment_status ON public.tds_records(payment_status);
CREATE INDEX IF NOT EXISTS idx_tds_records_pan_number ON public.tds_records(pan_number);

-- Add comment for documentation
COMMENT ON COLUMN public.tds_records.payment_status IS 'Status of TDS payment to government: PAID or UNPAID';
COMMENT ON COLUMN public.tds_records.payment_batch_id IS 'Batch ID for bulk TDS payments';