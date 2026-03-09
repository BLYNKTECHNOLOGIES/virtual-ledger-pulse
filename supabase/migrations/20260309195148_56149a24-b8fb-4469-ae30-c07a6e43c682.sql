-- Drop the OLD signature (sales_order_id first) that conflicts
DROP FUNCTION IF EXISTS public.process_sales_order_wallet_deduction(uuid, uuid, numeric, text);

-- Recreate with the CORRECT single signature (wallet_id first, matching my fix)
CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(
  wallet_id UUID,
  usdt_amount NUMERIC,
  sales_order_id UUID,
  p_asset_code TEXT DEFAULT 'USDT'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  current_bal NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
      WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
      ELSE 0 
    END
  ), 0) INTO current_bal
  FROM public.wallet_transactions
  WHERE wallet_transactions.wallet_id = process_sales_order_wallet_deduction.wallet_id
    AND asset_code = p_asset_code;

  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = wallet_id AND is_active = true) THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_bal < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', ROUND(current_bal, 4), ROUND(usdt_amount, 4);
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