CREATE OR REPLACE FUNCTION public.sync_sales_order_settlement_status(p_order_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE sales_orders so
  SET settlement_status = 'SETTLED'
  WHERE so.id = ANY(p_order_ids)
    AND so.settlement_status = 'PENDING'
    AND EXISTS (SELECT 1 FROM pending_settlements ps WHERE ps.sales_order_id = so.id)
    AND NOT EXISTS (
      SELECT 1 FROM pending_settlements ps
      WHERE ps.sales_order_id = so.id AND ps.status = 'PENDING'
    );
$function$;

-- Backfill: sales still flagged pending although every gateway leg is settled
SELECT public.sync_sales_order_settlement_status(
  ARRAY(SELECT id FROM sales_orders WHERE settlement_status = 'PENDING')
);
