-- Fix double stock update by removing sync_usdt_stock call from process_sales_order_wallet_deduction
-- The stock transaction triggers already handle stock updates properly

CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(
  sales_order_id uuid, 
  wallet_id uuid, 
  usdt_amount numeric
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
  current_wallet_balance NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  -- Check wallet balance
  SELECT current_balance INTO current_wallet_balance
  FROM public.wallets 
  WHERE id = wallet_id AND is_active = true;
  
  IF current_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_wallet_balance < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', current_wallet_balance, usdt_amount;
  END IF;
  
  -- Create wallet debit transaction
  INSERT INTO public.wallet_transactions (
    wallet_id,
    transaction_type,
    amount,
    reference_type,
    reference_id,
    description,
    balance_before,
    balance_after
  ) VALUES (
    wallet_id,
    'DEBIT',
    usdt_amount,
    'SALES_ORDER',
    sales_order_id,
    'USDT sold via sales order',
    current_wallet_balance,
    current_wallet_balance - usdt_amount
  ) RETURNING id INTO wallet_transaction_id;
  
  -- REMOVED: sync_usdt_stock() call
  -- The create_sales_stock_transaction trigger already handles stock updates
  -- via the stock_transactions table and update_product_stock_from_transaction trigger
  
  RETURN true;
END;
$function$;