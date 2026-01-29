
-- Reset orphaned purchase payment method usage (where no orders exist)
UPDATE public.purchase_payment_methods ppm
SET current_usage = 0, updated_at = now()
WHERE ppm.current_usage > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.purchase_payment_method_id = ppm.id
      AND po.status = 'COMPLETED'
  );

-- Reset orphaned sales payment method usage (where no orders exist)
UPDATE public.sales_payment_methods spm
SET current_usage = 0, updated_at = now()
WHERE spm.current_usage > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.sales_orders so
    WHERE so.sales_payment_method_id = spm.id
      AND so.payment_status = 'COMPLETED'
  );

-- Reset orphaned client monthly usage (where no orders exist in current month)
UPDATE public.clients c
SET current_month_used = 0, updated_at = now()
WHERE c.current_month_used > 0
  AND NOT EXISTS (
    -- Check sales orders this month
    SELECT 1 FROM public.sales_orders so
    WHERE so.client_name = c.name
      AND so.payment_status = 'COMPLETED'
      AND DATE_TRUNC('month', so.order_date) = DATE_TRUNC('month', CURRENT_DATE)
  )
  AND NOT EXISTS (
    -- Check purchase orders this month
    SELECT 1 FROM public.purchase_orders po
    WHERE po.supplier_name = c.name
      AND po.status = 'COMPLETED'
      AND DATE_TRUNC('month', po.order_date) = DATE_TRUNC('month', CURRENT_DATE)
  );
