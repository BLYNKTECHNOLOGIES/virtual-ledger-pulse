
-- 1. Table
CREATE TABLE public.tds_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  pan_number text,
  supplier_name text,
  order_number text,
  binance_order_number text,
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  subsidiary_id uuid REFERENCES public.subsidiaries(id),
  firm_name text,
  paid_amount numeric NOT NULL DEFAULT 0,
  allocated_tds_amount numeric NOT NULL DEFAULT 0,
  tds_rate numeric,
  deduction_date date,
  financial_year text,
  payment_status text NOT NULL DEFAULT 'UNPAID',
  paid_at timestamptz,
  paid_by uuid,
  payment_bank_account_id uuid,
  payment_batch_id text,
  tds_certificate_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tds_alloc_po ON public.tds_payment_allocations(purchase_order_id);
CREATE INDEX idx_tds_alloc_subsidiary ON public.tds_payment_allocations(subsidiary_id);
CREATE INDEX idx_tds_alloc_deduction_date ON public.tds_payment_allocations(deduction_date);
CREATE INDEX idx_tds_alloc_bank ON public.tds_payment_allocations(bank_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tds_payment_allocations TO authenticated;
GRANT ALL ON public.tds_payment_allocations TO service_role;

ALTER TABLE public.tds_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tds allocations"
  ON public.tds_payment_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tds allocations"
  ON public.tds_payment_allocations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tds allocations"
  ON public.tds_payment_allocations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete tds allocations"
  ON public.tds_payment_allocations FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_tds_alloc_updated_at
  BEFORE UPDATE ON public.tds_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Indian financial year helper
CREATE OR REPLACE FUNCTION public.indian_financial_year(d date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM d) >= 4
      THEN EXTRACT(YEAR FROM d)::int || '-' || RIGHT((EXTRACT(YEAR FROM d)::int + 1)::text, 2)
    ELSE (EXTRACT(YEAR FROM d)::int - 1) || '-' || RIGHT(EXTRACT(YEAR FROM d)::text, 2)
  END;
$$;

-- 3. Rebuild function (CTE-based, no temp tables)
CREATE OR REPLACE FUNCTION public.rebuild_tds_allocations(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po        RECORD;
  v_tds_total numeric;
  v_rate      numeric;
  v_fy        text;
  v_binance   text;
  v_total_amt numeric;
  v_bank      uuid;
  v_running   numeric;
  v_diff      numeric;
  v_max_id    uuid;
BEGIN
  SELECT po.*, ts.binance_order_number AS bo_number
  INTO v_po
  FROM public.purchase_orders po
  LEFT JOIN public.terminal_purchase_sync ts ON ts.id = po.terminal_sync_id
  WHERE po.id = p_po_id;

  -- Inactive / non-TDS / cancelled => just clear and exit
  IF v_po IS NULL OR COALESCE(v_po.tds_applied, false) = false
     OR v_po.status = 'CANCELLED' OR COALESCE(v_po.tds_amount, 0) = 0 THEN
    DELETE FROM public.tds_payment_allocations WHERE purchase_order_id = p_po_id;
    RETURN;
  END IF;

  v_tds_total := v_po.tds_amount;
  v_binance   := COALESCE(v_po.bo_number, v_po.order_number);
  v_total_amt := COALESCE(NULLIF(v_po.total_amount, 0), 1);
  v_bank      := v_po.bank_account_id;

  SELECT tds_rate, financial_year INTO v_rate, v_fy
  FROM public.tds_records WHERE purchase_order_id = p_po_id LIMIT 1;
  v_fy := COALESCE(v_fy, public.indian_financial_year(v_po.order_date));
  IF v_rate IS NULL AND COALESCE(v_po.total_amount, 0) <> 0 THEN
    v_rate := round(v_tds_total / v_po.total_amount * 100, 4);
  END IF;

  WITH prev AS (
    SELECT bank_account_id, payment_status, paid_at, paid_by,
           payment_bank_account_id, payment_batch_id, tds_certificate_number
    FROM public.tds_payment_allocations
    WHERE purchase_order_id = p_po_id
  ),
  del AS (
    DELETE FROM public.tds_payment_allocations WHERE purchase_order_id = p_po_id RETURNING 1
  ),
  legs_raw AS (
    SELECT s.bank_account_id, SUM(s.amount)::numeric AS amount
    FROM public.purchase_order_payment_splits s
    WHERE s.purchase_order_id = p_po_id
    GROUP BY s.bank_account_id
    UNION ALL
    SELECT v_bank, v_total_amt
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_order_payment_splits s2 WHERE s2.purchase_order_id = p_po_id
    )
  ),
  legs AS (
    SELECT bank_account_id, amount,
           NULLIF(SUM(amount) OVER (), 0) AS denom
    FROM legs_raw
  )
  INSERT INTO public.tds_payment_allocations(
    purchase_order_id, pan_number, supplier_name, order_number, binance_order_number,
    bank_account_id, subsidiary_id, firm_name, paid_amount, allocated_tds_amount,
    tds_rate, deduction_date, financial_year,
    payment_status, paid_at, paid_by, payment_bank_account_id, payment_batch_id, tds_certificate_number
  )
  SELECT
    p_po_id, v_po.pan_number, v_po.supplier_name, v_po.order_number, v_binance,
    l.bank_account_id, ba.subsidiary_id, sub.firm_name,
    l.amount, round(v_tds_total * l.amount / COALESCE(l.denom, v_total_amt), 2),
    v_rate, v_po.order_date, v_fy,
    COALESCE(pa.payment_status, 'UNPAID'), pa.paid_at, pa.paid_by,
    pa.payment_bank_account_id, pa.payment_batch_id, pa.tds_certificate_number
  FROM legs l
  LEFT JOIN public.bank_accounts ba ON ba.id = l.bank_account_id
  LEFT JOIN public.subsidiaries sub ON sub.id = ba.subsidiary_id
  LEFT JOIN prev pa ON pa.bank_account_id IS NOT DISTINCT FROM l.bank_account_id;

  -- Reconcile rounding remainder onto largest leg
  SELECT SUM(allocated_tds_amount) INTO v_running
  FROM public.tds_payment_allocations WHERE purchase_order_id = p_po_id;
  v_diff := v_tds_total - COALESCE(v_running, 0);

  IF v_diff <> 0 THEN
    SELECT id INTO v_max_id
    FROM public.tds_payment_allocations
    WHERE purchase_order_id = p_po_id
    ORDER BY paid_amount DESC, id ASC
    LIMIT 1;
    UPDATE public.tds_payment_allocations
    SET allocated_tds_amount = allocated_tds_amount + v_diff
    WHERE id = v_max_id;
  END IF;
END;
$$;

-- 4. Trigger wrappers
CREATE OR REPLACE FUNCTION public.trg_rebuild_tds_from_splits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.rebuild_tds_allocations(OLD.purchase_order_id);
    RETURN OLD;
  ELSE
    PERFORM public.rebuild_tds_allocations(NEW.purchase_order_id);
    IF TG_OP = 'UPDATE' AND NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN
      PERFORM public.rebuild_tds_allocations(OLD.purchase_order_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_splits_rebuild_tds
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_payment_splits
  FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_tds_from_splits();

CREATE OR REPLACE FUNCTION public.trg_rebuild_tds_from_po()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     NEW.tds_applied IS NOT DISTINCT FROM OLD.tds_applied AND
     NEW.tds_amount IS NOT DISTINCT FROM OLD.tds_amount AND
     NEW.status IS NOT DISTINCT FROM OLD.status AND
     NEW.bank_account_id IS NOT DISTINCT FROM OLD.bank_account_id AND
     NEW.pan_number IS NOT DISTINCT FROM OLD.pan_number THEN
    RETURN NEW;
  END IF;
  PERFORM public.rebuild_tds_allocations(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_po_rebuild_tds
  AFTER INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_tds_from_po();

-- 5. Backfill
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM public.purchase_orders
    WHERE tds_applied = true AND status <> 'CANCELLED' AND COALESCE(tds_amount,0) > 0
  LOOP
    PERFORM public.rebuild_tds_allocations(rec.id);
  END LOOP;
END $$;

-- 6. Carry over current paid/filed status from tds_records
UPDATE public.tds_payment_allocations a
SET payment_status = 'PAID',
    paid_at = tr.paid_at,
    paid_by = tr.paid_by,
    payment_bank_account_id = tr.payment_bank_account_id,
    payment_batch_id = tr.payment_batch_id
FROM public.tds_records tr
WHERE tr.purchase_order_id = a.purchase_order_id
  AND tr.payment_status = 'PAID'
  AND a.payment_status <> 'PAID';

UPDATE public.tds_payment_allocations a
SET tds_certificate_number = tr.tds_certificate_number
FROM public.tds_records tr
WHERE tr.purchase_order_id = a.purchase_order_id
  AND tr.tds_certificate_number IS NOT NULL
  AND a.tds_certificate_number IS NULL;
