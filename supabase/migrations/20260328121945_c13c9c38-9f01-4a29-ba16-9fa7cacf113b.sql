-- Fix F2: Replace dead usdt_amount wallet check with asset-specific balance check
CREATE OR REPLACE FUNCTION public.validate_sales_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  product_stock NUMERIC;
  product_name TEXT;
  product_code TEXT;
  wallet_asset_bal NUMERIC;
  wallet_name TEXT;
  effective_stock NUMERIC;
  effective_wallet NUMERIC;
BEGIN
  -- Stock check (unchanged)
  IF NEW.product_id IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    SELECT current_stock_quantity, name, code INTO product_stock, product_name, product_code
    FROM public.products WHERE id = NEW.product_id;
    IF product_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found for ID: %', NEW.product_id;
    END IF;
    effective_stock := product_stock;
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'COMPLETED' AND OLD.product_id = NEW.product_id THEN
      effective_stock := effective_stock + OLD.quantity;
    END IF;
    IF effective_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%". Available: %, Required: %', 
        product_name, effective_stock, NEW.quantity;
    END IF;
  END IF;

  -- Wallet asset balance check — uses wallet_asset_balances for the specific asset
  IF NEW.wallet_id IS NOT NULL AND NEW.quantity IS NOT NULL AND NEW.quantity > 0 AND NEW.product_id IS NOT NULL THEN
    -- Get the asset code from the product
    IF product_code IS NULL THEN
      SELECT code INTO product_code FROM public.products WHERE id = NEW.product_id;
    END IF;

    SELECT w.wallet_name INTO wallet_name
    FROM public.wallets w WHERE w.id = NEW.wallet_id AND w.is_active = true;

    IF wallet_name IS NULL THEN
      RAISE EXCEPTION 'Wallet not found or inactive for ID: %', NEW.wallet_id;
    END IF;

    SELECT COALESCE(wab.balance, 0) INTO wallet_asset_bal
    FROM public.wallet_asset_balances wab
    WHERE wab.wallet_id = NEW.wallet_id AND wab.asset_code = UPPER(COALESCE(product_code, 'USDT'));

    IF wallet_asset_bal IS NULL THEN
      wallet_asset_bal := 0;
    END IF;

    effective_wallet := wallet_asset_bal;
    -- If updating a completed order with the same wallet, add back the old quantity
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'COMPLETED' AND OLD.wallet_id = NEW.wallet_id THEN
      effective_wallet := effective_wallet + COALESCE(OLD.quantity, 0);
    END IF;

    IF effective_wallet < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient wallet balance for "%" (%). Available: %, Required: %', 
        wallet_name, UPPER(COALESCE(product_code, 'USDT')), effective_wallet, NEW.quantity;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;