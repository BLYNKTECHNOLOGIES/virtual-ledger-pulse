-- Create sequence for SM order numbers, starting after the highest existing SM##### number
DO $$
DECLARE
  max_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '^SM0*', ''), '')::INTEGER), 0)
  INTO max_seq
  FROM public.sales_orders
  WHERE order_number ~ '^SM[0-9]+$';

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.small_sales_order_seq START WITH %s', max_seq + 1);
  -- If sequence already existed, bump it to be safe
  PERFORM setval('public.small_sales_order_seq', GREATEST(max_seq, (SELECT last_value FROM public.small_sales_order_seq)));
END $$;

-- Atomic RPC to get the next SM order number
CREATE OR REPLACE FUNCTION public.next_small_sales_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val BIGINT;
  candidate TEXT;
BEGIN
  LOOP
    next_val := nextval('public.small_sales_order_seq');
    candidate := 'SM' || lpad(next_val::TEXT, 5, '0');
    -- Skip if somehow already exists (handles legacy collisions)
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sales_orders WHERE order_number = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_small_sales_order_number() TO authenticated, anon, service_role;