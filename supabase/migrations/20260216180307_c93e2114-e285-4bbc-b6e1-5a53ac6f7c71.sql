
-- Fix: process_sales_order_wallet_deduction should check asset-specific balance for non-USDT
CREATE OR REPLACE FUNCTION process_sales_order_wallet_deduction(
  sales_order_id UUID,
  wallet_id UUID,
  usdt_amount NUMERIC,
  p_asset_code TEXT DEFAULT 'USDT'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bal NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  IF p_asset_code = 'USDT' THEN
    -- For USDT, check wallets.current_balance
    SELECT current_balance INTO current_bal
    FROM public.wallets 
    WHERE id = wallet_id AND is_active = true;
  ELSE
    -- For non-USDT, check wallet_asset_balances
    SELECT COALESCE(balance, 0) INTO current_bal
    FROM public.wallet_asset_balances
    WHERE wallet_asset_balances.wallet_id = process_sales_order_wallet_deduction.wallet_id
      AND asset_code = p_asset_code;

    -- If no row found, check wallet is at least active
    IF current_bal IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = wallet_id AND is_active = true) THEN
        RAISE EXCEPTION 'Wallet not found or inactive';
      END IF;
      current_bal := 0;
    END IF;
  END IF;

  IF current_bal IS NULL THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_bal < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', current_bal, usdt_amount;
  END IF;
  
  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, amount, reference_type, reference_id,
    description, balance_before, balance_after, asset_code
  ) VALUES (
    wallet_id, 'DEBIT', usdt_amount, 'SALES_ORDER', sales_order_id,
    p_asset_code || ' sold via sales order',
    0, 0, p_asset_code
  ) RETURNING id INTO wallet_transaction_id;
  
  RETURN true;
END;
$$;
