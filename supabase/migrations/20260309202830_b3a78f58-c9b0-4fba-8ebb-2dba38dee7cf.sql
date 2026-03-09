
-- =====================================================
-- Phase 3: Backfill client monthly usage from actual completed sales
-- Recalculate current_month_used for all clients based on completed sales this month
-- =====================================================

-- Reset all client monthly usage and recalculate from actual data
UPDATE public.clients c
SET current_month_used = COALESCE(sub.actual_usage, 0),
    updated_at = now()
FROM (
  SELECT c2.id,
    COALESCE(SUM(so.total_amount), 0) as actual_usage
  FROM clients c2
  LEFT JOIN sales_orders so ON so.client_id = c2.id 
    AND so.status = 'COMPLETED'
    AND so.order_date >= date_trunc('month', now())
  WHERE c2.is_deleted = false
  GROUP BY c2.id
) sub
WHERE c.id = sub.id
AND c.is_deleted = false;

-- Also handle the 24 orphaned sales orders by name-matching clients who don't have exact id match
-- but DO have name matches (these are likely typos or case mismatches)
UPDATE public.clients c
SET current_month_used = current_month_used + COALESCE(orphan.total, 0),
    updated_at = now()
FROM (
  SELECT c2.id, SUM(so.total_amount) as total
  FROM sales_orders so
  JOIN clients c2 ON LOWER(TRIM(c2.name)) = LOWER(TRIM(so.client_name))
  WHERE so.client_id IS NULL
    AND so.status = 'COMPLETED'
    AND so.order_date >= date_trunc('month', now())
    AND c2.is_deleted = false
  GROUP BY c2.id
) orphan
WHERE c.id = orphan.id;
