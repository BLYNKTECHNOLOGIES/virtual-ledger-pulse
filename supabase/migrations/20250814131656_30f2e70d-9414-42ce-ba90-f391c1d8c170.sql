-- Add check constraints to prevent negative stock and overselling

-- First, let's add a trigger to validate stock before any sales order creation
CREATE OR REPLACE FUNCTION public.validate_sales_order_stock()
RETURNS TRIGGER AS $$
DECLARE
  product_stock NUMERIC;
  product_name TEXT;
  wallet_balance NUMERIC;
  wallet_name TEXT;
BEGIN
  -- Validate product stock if product_id is specified
  IF NEW.product_id IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    SELECT current_stock_quantity, name INTO product_stock, product_name
    FROM public.products 
    WHERE id = NEW.product_id;
    
    IF product_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found for ID: %', NEW.product_id;
    END IF;
    
    IF product_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%". Available: %, Required: %', 
        product_name, product_stock, NEW.quantity;
    END IF;
  END IF;
  
  -- Validate wallet balance if wallet_id is specified
  IF NEW.wallet_id IS NOT NULL AND NEW.usdt_amount IS NOT NULL AND NEW.usdt_amount > 0 THEN
    SELECT current_balance, wallet_name INTO wallet_balance, wallet_name
    FROM public.wallets 
    WHERE id = NEW.wallet_id AND is_active = true;
    
    IF wallet_balance IS NULL THEN
      RAISE EXCEPTION 'Wallet not found or inactive for ID: %', NEW.wallet_id;
    END IF;
    
    IF wallet_balance < NEW.usdt_amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance for "%". Available: %, Required: %', 
        wallet_name, wallet_balance, NEW.usdt_amount;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate before INSERT and UPDATE
DROP TRIGGER IF EXISTS validate_sales_order_stock_trigger ON public.sales_orders;
CREATE TRIGGER validate_sales_order_stock_trigger
  BEFORE INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sales_order_stock();

-- Add check constraint to ensure products cannot go negative
ALTER TABLE public.products 
DROP CONSTRAINT IF EXISTS products_stock_non_negative;

ALTER TABLE public.products 
ADD CONSTRAINT products_stock_non_negative 
CHECK (current_stock_quantity >= 0);

-- Add check constraint to ensure wallets cannot go negative  
ALTER TABLE public.wallets
DROP CONSTRAINT IF EXISTS wallets_balance_non_negative;

ALTER TABLE public.wallets
ADD CONSTRAINT wallets_balance_non_negative 
CHECK (current_balance >= 0);