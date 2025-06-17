
-- Add missing columns to purchase_orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS payment_method_type text,
ADD COLUMN IF NOT EXISTS upi_id text,
ADD COLUMN IF NOT EXISTS bank_account_number text,
ADD COLUMN IF NOT EXISTS bank_account_name text,
ADD COLUMN IF NOT EXISTS ifsc_code text,
ADD COLUMN IF NOT EXISTS assigned_to text,
ADD COLUMN IF NOT EXISTS failure_reason text,
ADD COLUMN IF NOT EXISTS failure_proof_url text,
ADD COLUMN IF NOT EXISTS payment_proof_url text,
ADD COLUMN IF NOT EXISTS payment_method_used text;

-- Add constraints for payment method validation using DO blocks
DO $$ 
BEGIN
    -- Add UPI payment method constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'check_payment_method_upi' 
        AND table_name = 'purchase_orders'
    ) THEN
        ALTER TABLE public.purchase_orders 
        ADD CONSTRAINT check_payment_method_upi 
        CHECK (
            (payment_method_type = 'UPI' AND upi_id IS NOT NULL) OR 
            (payment_method_type != 'UPI' OR payment_method_type IS NULL)
        );
    END IF;

    -- Add Bank Transfer payment method constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'check_payment_method_bank' 
        AND table_name = 'purchase_orders'
    ) THEN
        ALTER TABLE public.purchase_orders 
        ADD CONSTRAINT check_payment_method_bank 
        CHECK (
            (payment_method_type = 'BANK_TRANSFER' AND bank_account_number IS NOT NULL AND bank_account_name IS NOT NULL AND ifsc_code IS NOT NULL) OR 
            (payment_method_type != 'BANK_TRANSFER' OR payment_method_type IS NULL)
        );
    END IF;
END $$;
