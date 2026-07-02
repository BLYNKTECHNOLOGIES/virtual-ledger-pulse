-- Reconciliation & Exception Cockpit: state table + read-only mismatch function

-- 1. State table for acknowledging/resolving derived exceptions (lanes without own ack columns)
CREATE TABLE public.reconciliation_exception_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exception_type text NOT NULL,
  exception_ref text NOT NULL,
  acknowledged_by uuid,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_by_name text,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exception_type, exception_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_exception_state TO authenticated;
GRANT ALL ON public.reconciliation_exception_state TO service_role;

ALTER TABLE public.reconciliation_exception_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reconciliation users can read exception state"
ON public.reconciliation_exception_state
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Reconciliation users can write exception state"
ON public.reconciliation_exception_state
FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_reconciliation_exception_state_updated_at
BEFORE UPDATE ON public.reconciliation_exception_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Read-only function: orders whose payment-split totals diverge from the order total (> 0.01)
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
  SELECT 'purchase'::text AS order_type,
         po.id AS order_id,
         po.order_number,
         po.supplier_name AS party_name,
         po.total_amount AS order_total,
         s.split_total,
         (s.split_total - po.total_amount) AS delta,
         po.order_date
  FROM public.purchase_orders po
  JOIN (
    SELECT purchase_order_id, SUM(amount) AS split_total
    FROM public.purchase_order_payment_splits
    GROUP BY purchase_order_id
  ) s ON s.purchase_order_id = po.id
  WHERE ABS(s.split_total - po.total_amount) > 0.01

  UNION ALL

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