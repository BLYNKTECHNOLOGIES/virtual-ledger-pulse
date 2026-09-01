
CREATE OR REPLACE FUNCTION public.get_client_order_metrics()
RETURNS TABLE (
  client_id uuid,
  sales_order_count integer,
  purchase_order_count integer,
  total_sales_value numeric,
  total_purchase_value numeric,
  last_sales_order_date date,
  last_purchase_order_date date,
  last10_sales_value numeric,
  prev10_sales_value numeric,
  last10_purchase_value numeric,
  prev10_purchase_value numeric,
  current_month_sales_value numeric,
  previous_month_sales_value numeric,
  current_month_purchase_value numeric,
  previous_month_purchase_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH guard AS (
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.can_manage_clients(auth.uid()) THEN true
    WHEN public.can_view_orders(auth.uid()) THEN true
    WHEN public.has_permission(auth.uid(), 'clients_view'::app_permission) THEN true
    WHEN public.has_permission(auth.uid(), 'view_clients'::app_permission) THEN true
    ELSE false
  END AS allowed
),
bounds AS (
  SELECT
    (now() AT TIME ZONE 'Asia/Kolkata')::date AS today,
    ((now() AT TIME ZONE 'Asia/Kolkata')::date - 10) AS last10_start,
    ((now() AT TIME ZONE 'Asia/Kolkata')::date - 20) AS prev10_start,
    date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)::date AS cur_month_start,
    (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date) - interval '1 month')::date AS prev_month_start,
    (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date) - interval '1 day')::date AS prev_month_end
),
c AS (
  SELECT id, name, phone FROM public.clients WHERE is_deleted = false
),
so AS (
  SELECT client_id, client_name, total_amount, order_date
  FROM public.sales_orders
  WHERE status IS DISTINCT FROM 'CANCELLED'
),
po AS (
  SELECT id, supplier_name, contact_number, total_amount, order_date
  FROM public.purchase_orders
  WHERE status IS DISTINCT FROM 'CANCELLED'
),
sales_matched AS (
  SELECT c.id AS cid, so.total_amount, so.order_date
  FROM c JOIN so ON so.client_id = c.id
  UNION ALL
  SELECT c.id, so.total_amount, so.order_date
  FROM c JOIN so ON so.client_id IS NULL AND so.client_name = c.name
),
purchase_matched AS (
  SELECT DISTINCT ON (c.id, po.id) c.id AS cid, po.total_amount, po.order_date
  FROM c
  JOIN po ON po.supplier_name = c.name OR (c.phone IS NOT NULL AND po.contact_number = c.phone)
),
sales_agg AS (
  SELECT
    sm.cid,
    count(*)::int AS cnt,
    coalesce(sum(sm.total_amount), 0) AS total_val,
    max(sm.order_date::date) AS last_date,
    coalesce(sum(sm.total_amount) FILTER (WHERE sm.order_date::date >= b.last10_start), 0) AS last10,
    coalesce(sum(sm.total_amount) FILTER (WHERE sm.order_date::date >= b.prev10_start AND sm.order_date::date < b.last10_start), 0) AS prev10,
    coalesce(sum(sm.total_amount) FILTER (WHERE sm.order_date::date >= b.cur_month_start), 0) AS cur_month,
    coalesce(sum(sm.total_amount) FILTER (WHERE sm.order_date::date >= b.prev_month_start AND sm.order_date::date <= b.prev_month_end), 0) AS prev_month
  FROM sales_matched sm CROSS JOIN bounds b
  GROUP BY sm.cid
),
purchase_agg AS (
  SELECT
    pm.cid,
    count(*)::int AS cnt,
    coalesce(sum(pm.total_amount), 0) AS total_val,
    max(pm.order_date::date) AS last_date,
    coalesce(sum(pm.total_amount) FILTER (WHERE pm.order_date::date >= b.last10_start), 0) AS last10,
    coalesce(sum(pm.total_amount) FILTER (WHERE pm.order_date::date >= b.prev10_start AND pm.order_date::date < b.last10_start), 0) AS prev10,
    coalesce(sum(pm.total_amount) FILTER (WHERE pm.order_date::date >= b.cur_month_start), 0) AS cur_month,
    coalesce(sum(pm.total_amount) FILTER (WHERE pm.order_date::date >= b.prev_month_start AND pm.order_date::date <= b.prev_month_end), 0) AS prev_month
  FROM purchase_matched pm CROSS JOIN bounds b
  GROUP BY pm.cid
)
SELECT
  c.id,
  coalesce(sa.cnt, 0),
  coalesce(pa.cnt, 0),
  coalesce(sa.total_val, 0),
  coalesce(pa.total_val, 0),
  sa.last_date,
  pa.last_date,
  coalesce(sa.last10, 0),
  coalesce(sa.prev10, 0),
  coalesce(pa.last10, 0),
  coalesce(pa.prev10, 0),
  coalesce(sa.cur_month, 0),
  coalesce(sa.prev_month, 0),
  coalesce(pa.cur_month, 0),
  coalesce(pa.prev_month, 0)
FROM c
LEFT JOIN sales_agg sa ON sa.cid = c.id
LEFT JOIN purchase_agg pa ON pa.cid = c.id
WHERE (SELECT allowed FROM guard)
  AND (sa.cid IS NOT NULL OR pa.cid IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.get_client_order_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_order_metrics() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_sales_orders_client_id_status ON public.sales_orders (client_id) WHERE status IS DISTINCT FROM 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_sales_orders_client_name ON public.sales_orders (client_name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_name ON public.purchase_orders (supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_contact_number ON public.purchase_orders (contact_number);
