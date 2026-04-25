CREATE OR REPLACE FUNCTION public.decode_binance_cancel_reason(_code integer, _fallback text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _code
    WHEN 4 THEN 'Seller payment method issue'
    WHEN 5 THEN 'Other'
    ELSE COALESCE(_fallback, CASE WHEN _code IS NULL THEN NULL ELSE 'Unknown Binance cancel reason ' || _code::text END)
  END;
$$;
