
-- Drop ALL overloaded function signatures, then recreate only the correct ones

-- 1. Fix create_manual_purchase_complete_v2: drop old signature (with p_description after p_total_amount)
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(
  p_order_number text, p_supplier_name text, p_order_date date, 
  p_description text, p_total_amount numeric, p_contact_number text, 
  p_bank_account_id uuid, p_product_id uuid, p_quantity numeric, 
  p_unit_price numeric, p_tds_option text, p_pan_number text, 
  p_is_off_market boolean, p_fee_percentage numeric, p_credit_wallet_id uuid, 
  p_created_by uuid
);

-- 2. Fix create_manual_purchase_with_split_payments: drop old signature
DROP FUNCTION IF EXISTS public.create_manual_purchase_with_split_payments(
  p_order_number text, p_supplier_name text, p_order_date date, 
  p_description text, p_total_amount numeric, p_contact_number text, 
  p_product_id uuid, p_quantity numeric, p_unit_price numeric, 
  p_payment_splits jsonb, p_tds_option text, p_pan_number text, 
  p_is_off_market boolean, p_fee_percentage numeric, p_credit_wallet_id uuid, 
  p_created_by uuid
);

-- 3. Fix get_my_terminal_notifications: drop parameterless version (uses auth.uid() which is NULL)
DROP FUNCTION IF EXISTS public.get_my_terminal_notifications();

-- 4. Fix terminal_heartbeat: drop parameterless version (uses auth.uid() which is NULL)
DROP FUNCTION IF EXISTS public.terminal_heartbeat();
