-- WAC per product (stablecoins use USDT-equivalent qty, other coins use actual coin qty)
CREATE OR REPLACE FUNCTION public.get_product_avg_costs()
RETURNS TABLE (product_code text, total_quantity numeric, total_cost numeric, average_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH po_item AS (
    SELECT DISTINCT ON (po.id)
      po.id,
      COALESCE(po.net_payable_amount, 0)::numeric AS cost,
      po.effective_usdt_qty::numeric AS eff_qty,
      poi.quantity::numeric AS item_qty,
      p.code AS product_code
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    JOIN public.products p ON p.id = poi.product_id
    WHERE po.status = 'COMPLETED'
      AND po.effective_usdt_qty IS NOT NULL
      AND COALESCE(po.net_payable_amount, 0) > 0
    ORDER BY po.id, poi.created_at NULLS LAST, poi.id
  ), denom AS (
    SELECT
      product_code,
      cost,
      CASE WHEN upper(product_code) IN ('USDT','USDC')
           THEN COALESCE(eff_qty, 0)
           ELSE COALESCE(item_qty, 0) END AS qty
    FROM po_item
  )
  SELECT
    product_code,
    SUM(qty)::numeric AS total_quantity,
    SUM(cost)::numeric AS total_cost,
    CASE WHEN SUM(qty) > 0 THEN SUM(cost) / SUM(qty) ELSE 0 END::numeric AS average_cost
  FROM denom
  WHERE qty > 0
  GROUP BY product_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_avg_costs() TO authenticated, service_role;

-- Simple line-item cost basis per product (used by Total Asset Value stock valuation)
CREATE OR REPLACE FUNCTION public.get_product_cost_basis()
RETURNS TABLE (product_code text, total_quantity numeric, total_cost numeric, average_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.code AS product_code,
    SUM(COALESCE(poi.quantity, 0))::numeric AS total_quantity,
    SUM(COALESCE(poi.total_price, 0))::numeric AS total_cost,
    CASE WHEN SUM(COALESCE(poi.quantity, 0)) > 0
         THEN SUM(COALESCE(poi.total_price, 0)) / SUM(COALESCE(poi.quantity, 0))
         ELSE 0 END::numeric AS average_cost
  FROM public.purchase_orders po
  JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
  JOIN public.products p ON p.id = poi.product_id
  WHERE po.status = 'COMPLETED'
  GROUP BY p.code;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_cost_basis() TO authenticated, service_role;

-- Unpaid TDS aggregate (avoids paginating ~1800 rows just for a total)
CREATE OR REPLACE FUNCTION public.get_unpaid_tds_total()
RETURNS TABLE (total_amount numeric, record_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(tds_amount), 0)::numeric, COUNT(*)::int
  FROM public.tds_records
  WHERE payment_status IS NULL OR payment_status <> 'PAID';
$$;

GRANT EXECUTE ON FUNCTION public.get_unpaid_tds_total() TO authenticated, service_role;