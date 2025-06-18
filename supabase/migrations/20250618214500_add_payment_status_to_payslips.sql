
-- Add payment_status column to payslips table
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING';

-- Update existing records to have a default status
UPDATE payslips SET payment_status = 'PENDING' WHERE payment_status IS NULL;
