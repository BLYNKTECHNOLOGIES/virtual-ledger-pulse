-- Fix: Make process_sales_order_wallet_deduction SECURITY DEFINER so it bypasses RLS
-- (this app uses custom auth, not Supabase auth, so auth.role() = 'anon')
CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(
  sales_order_id uuid,
  wallet_id uuid,
  usdt_amount numeric,
  p_asset_code text DEFAULT 'USDT'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_wallet_balance NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  SELECT current_balance INTO current_wallet_balance
  FROM public.wallets 
  WHERE id = wallet_id AND is_active = true;
  
  IF current_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_wallet_balance < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', current_wallet_balance, usdt_amount;
  END IF;
  
  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, amount, reference_type, reference_id,
    description, balance_before, balance_after, asset_code
  ) VALUES (
    wallet_id, 'DEBIT', usdt_amount, 'SALES_ORDER', sales_order_id,
    p_asset_code || ' sold via sales order',
    current_wallet_balance, current_wallet_balance - usdt_amount, p_asset_code
  ) RETURNING id INTO wallet_transaction_id;
  
  RETURN true;
END;
$$;