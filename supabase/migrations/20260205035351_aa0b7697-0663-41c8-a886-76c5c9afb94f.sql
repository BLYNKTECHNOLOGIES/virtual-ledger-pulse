-- Create preview functions that show next number WITHOUT consuming the sequence
-- These use currval+1 or a query to peek at the next value

-- Preview function for off-market sales order number (OFS)
CREATE OR REPLACE FUNCTION public.preview_off_market_sales_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_val BIGINT;
BEGIN
    -- Get the next value that will be used (without consuming it)
    SELECT last_value + 1 INTO next_val FROM off_market_sales_seq;
    -- If sequence has never been used, last_value is 0 but next call will return 1
    IF next_val = 1 THEN
        -- Check if sequence has been called at least once
        SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END INTO next_val 
        FROM off_market_sales_seq;
    END IF;
    RETURN 'OFS' || LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- Preview function for off-market purchase order number (OFP)
CREATE OR REPLACE FUNCTION public.preview_off_market_purchase_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_val BIGINT;
BEGIN
    -- Get the next value that will be used (without consuming it)
    SELECT last_value + 1 INTO next_val FROM off_market_purchase_seq;
    -- If sequence has never been used, last_value is 0 but next call will return 1
    IF next_val = 1 THEN
        -- Check if sequence has been called at least once
        SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END INTO next_val 
        FROM off_market_purchase_seq;
    END IF;
    RETURN 'OFP' || LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.preview_off_market_sales_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_off_market_purchase_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_off_market_sales_order_number() TO anon;
GRANT EXECUTE ON FUNCTION public.preview_off_market_purchase_order_number() TO anon;