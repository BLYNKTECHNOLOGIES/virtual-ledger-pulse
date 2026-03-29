-- Part A: Drop purchase_creator and payer columns from users table
ALTER TABLE public.users 
  DROP COLUMN IF EXISTS is_purchase_creator,
  DROP COLUMN IF EXISTS is_payer;

-- Delete purchase_creator and payer role_functions entries
DELETE FROM public.role_functions 
WHERE function_id IN (
  SELECT id FROM public.system_functions 
  WHERE function_key IN ('purchase_creator', 'payer')
);

-- Delete purchase_creator and payer from system_functions
DELETE FROM public.system_functions 
WHERE function_key IN ('purchase_creator', 'payer');

-- Also remove the enforce_purchase_order_status_rules trigger if it exists
-- (it enforced creator/payer separation which is no longer needed)
DROP TRIGGER IF EXISTS enforce_purchase_order_status_rules ON public.purchase_orders;