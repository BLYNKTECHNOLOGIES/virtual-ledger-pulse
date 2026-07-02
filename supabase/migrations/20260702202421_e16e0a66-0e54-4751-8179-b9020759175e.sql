CREATE OR REPLACE FUNCTION public.get_payment_split_mismatches()
RETURNS TABLE (
  order_type text,
  order_id uuid,
  order_number text,
  party_name text,
  order_total numeric,
  split_total numeric,
  delta numeric,
  order_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Purchase splits sum to the net payable amount (after TDS); fall back to total.
  SELECT 'purchase'::text AS order_type,
         po.id AS order_id,
         po.order_number,
         po.supplier_name AS party_name,
         COALESCE(po.net_payable_amount, po.total_amount) AS order_total,
         s.split_total,
         (s.split_total - COALESCE(po.net_payable_amount, po.total_amount)) AS delta,
         po.order_date
  FROM public.purchase_orders po
  JOIN (
    SELECT purchase_order_id, SUM(amount) AS split_total
    FROM public.purchase_order_payment_splits
    GROUP BY purchase_order_id
  ) s ON s.purchase_order_id = po.id
  WHERE ABS(s.split_total - COALESCE(po.net_payable_amount, po.total_amount)) > 0.01

  UNION ALL

  -- Sales splits sum to the order total.
  SELECT 'sales'::text AS order_type,
         so.id AS order_id,
         so.order_number,
         so.client_name AS party_name,
         so.total_amount AS order_total,
         s.split_total,
         (s.split_total - so.total_amount) AS delta,
         so.order_date
  FROM public.sales_orders so
  JOIN (
    SELECT sales_order_id, SUM(amount) AS split_total
    FROM public.sales_order_payment_splits
    GROUP BY sales_order_id
  ) s ON s.sales_order_id = so.id
  WHERE ABS(s.split_total - so.total_amount) > 0.01;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_split_mismatches() TO authenticated, service_role;