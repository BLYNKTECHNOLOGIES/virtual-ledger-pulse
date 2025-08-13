-- Fix the validation function to properly allow balance updates when being unlocked
CREATE OR REPLACE FUNCTION public.validate_balance_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow balance updates if:
  -- 1. Balance is not locked (balance_locked is false)
  -- 2. This is an automatic update (updated_at is being changed)
  -- 3. We're unlocking the account (balance_locked is being set to false)
  IF OLD.balance_locked = true AND NEW.balance != OLD.balance AND 
     NEW.updated_at = OLD.updated_at AND NEW.balance_locked = true THEN
    RAISE EXCEPTION 'Cannot modify balance: Account balance is locked due to existing transactions';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Now test the purchase order creation
INSERT INTO public.purchase_orders (
  order_number,
  supplier_name,
  order_date,
  status,
  total_amount,
  net_payable_amount,
  bank_account_id
) VALUES (
  'TEST-WORKING-' || extract(epoch from now())::text,
  'Test Working Purchase',
  CURRENT_DATE,
  'COMPLETED',
  1500,
  1500,
  '87d199b7-1d03-48e6-ace1-62344547bc95'
);

-- Check the results
SELECT 
  account_name, 
  balance, 
  balance_locked 
FROM bank_accounts 
WHERE id = '87d199b7-1d03-48e6-ace1-62344547bc95';