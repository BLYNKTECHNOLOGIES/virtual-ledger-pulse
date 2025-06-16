
-- Update the check constraint to allow the correct adjustment types
ALTER TABLE public.stock_adjustments 
DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;

-- Add the new check constraint with the correct values
ALTER TABLE public.stock_adjustments 
ADD CONSTRAINT stock_adjustments_adjustment_type_check 
CHECK (adjustment_type IN ('LOST', 'CORRECTION', 'TRANSFER'));
