-- Create sequences for off-market order numbers
CREATE SEQUENCE IF NOT EXISTS off_market_sales_seq START WITH 1 INCREMENT BY 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS off_market_purchase_seq START WITH 1 INCREMENT BY 1 NO CYCLE;

-- Function to generate off-market sales order number (OFS000001 format)
CREATE OR REPLACE FUNCTION public.generate_off_market_sales_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  SELECT nextval('off_market_sales_seq') INTO next_val;
  RETURN 'OFS' || LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- Function to generate off-market purchase order number (OFP000001 format)
CREATE OR REPLACE FUNCTION public.generate_off_market_purchase_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  SELECT nextval('off_market_purchase_seq') INTO next_val;
  RETURN 'OFP' || LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_off_market_sales_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_off_market_purchase_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_off_market_sales_order_number() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_off_market_purchase_order_number() TO anon;

-- Add is_off_market column to sales_orders if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sales_orders' 
    AND column_name = 'is_off_market'
  ) THEN
    ALTER TABLE public.sales_orders ADD COLUMN is_off_market BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add is_off_market column to purchase_orders if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'purchase_orders' 
    AND column_name = 'is_off_market'
  ) THEN
    ALTER TABLE public.purchase_orders ADD COLUMN is_off_market BOOLEAN DEFAULT FALSE;
  END IF;
END $$;