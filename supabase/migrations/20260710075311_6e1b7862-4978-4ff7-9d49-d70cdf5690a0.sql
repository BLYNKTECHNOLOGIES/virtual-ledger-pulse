-- Resolve PGRST203: two overloads of create_buyer_client_with_evidence exist.
-- The nickname-aware version supersedes the old one; drop the stale overload
-- (the signature WITHOUT p_nickname) so calls disambiguate cleanly.
DROP FUNCTION IF EXISTS public.create_buyer_client_with_evidence(
  p_name text,
  p_client_id text,
  p_phone text,
  p_order_amount numeric,
  p_order_date date,
  p_sales_order_id uuid
);