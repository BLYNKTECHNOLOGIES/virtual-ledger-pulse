-- Backfill order details onto de-merge-created onboarding approvals that were
-- inserted with order_amount=0 / order_date NULL / sales_order_id NULL.
-- Root cause: the de-merge migration created split-client PENDING approvals directly,
-- bypassing create_client_onboarding_approval() which normally copies the originating
-- sales order's total_amount, order_date and id. We restore those from each approval's
-- resolved client's earliest real order.

-- 1) Prefer a real sales_orders row (also links sales_order_id for drill-through).
UPDATE public.client_onboarding_approvals a
SET sales_order_id = sub.id,
    order_amount    = sub.total_amount,
    order_date      = sub.order_date,
    updated_at      = now()
FROM (
  SELECT DISTINCT ON (client_id)
         client_id, id, total_amount, order_date
  FROM public.sales_orders
  WHERE client_id IS NOT NULL AND total_amount IS NOT NULL
  ORDER BY client_id, order_date ASC NULLS LAST, created_at ASC
) sub
WHERE a.resolved_client_id = sub.client_id
  AND a.approval_status = 'PENDING'
  AND a.sales_order_id IS NULL
  AND (a.order_amount IS NULL OR a.order_amount = 0);

-- 2) Fallback: derive amount/date from the client's earliest terminal_sales_sync order
--    (no sales_order to link, but we can still show a real amount and IST date).
UPDATE public.client_onboarding_approvals a
SET order_amount = sub.amt,
    order_date   = sub.odate,
    updated_at   = now()
FROM (
  SELECT DISTINCT ON (client_id)
         client_id,
         (order_data->>'total_price')::numeric AS amt,
         (to_timestamp((order_data->>'create_time')::bigint / 1000)
            AT TIME ZONE 'Asia/Kolkata')::date AS odate
  FROM public.terminal_sales_sync
  WHERE client_id IS NOT NULL
    AND order_data->>'total_price' IS NOT NULL
    AND order_data->>'create_time' ~ '^[0-9]+$'
  ORDER BY client_id, (order_data->>'create_time')::bigint ASC
) sub
WHERE a.resolved_client_id = sub.client_id
  AND a.approval_status = 'PENDING'
  AND a.sales_order_id IS NULL
  AND (a.order_amount IS NULL OR a.order_amount = 0);