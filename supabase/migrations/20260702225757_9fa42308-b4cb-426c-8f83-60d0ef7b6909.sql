-- 1. Flag for TDS allocations settled without a bank deduction (already recorded externally)
ALTER TABLE public.tds_payment_allocations
  ADD COLUMN IF NOT EXISTS already_recorded boolean NOT NULL DEFAULT false;

-- 2. Keep tds_records.payment_status in sync with allocation settlement state.
--    A PO's TDS is considered PAID only when it has >=1 allocation and ALL its
--    allocations are PAID. This is what every liability calculation reads
--    (Total Asset Value, daily snapshot, reports).
CREATE OR REPLACE FUNCTION public.sync_tds_record_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po uuid;
  v_total int;
  v_paid int;
  v_status text;
BEGIN
  v_po := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  IF v_po IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*), count(*) FILTER (WHERE payment_status = 'PAID')
    INTO v_total, v_paid
  FROM public.tds_payment_allocations
  WHERE purchase_order_id = v_po;

  v_status := CASE WHEN v_total > 0 AND v_paid = v_total THEN 'PAID' ELSE 'UNPAID' END;

  UPDATE public.tds_records
     SET payment_status = v_status
   WHERE purchase_order_id = v_po
     AND COALESCE(payment_status, 'UNPAID') IS DISTINCT FROM v_status;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tds_record_status ON public.tds_payment_allocations;
CREATE TRIGGER trg_sync_tds_record_status
  AFTER INSERT OR UPDATE OR DELETE ON public.tds_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.sync_tds_record_payment_status();

-- 3. One-time backfill: reconcile existing tds_records from current allocation state.
UPDATE public.tds_records r
   SET payment_status = agg.status
  FROM (
    SELECT purchase_order_id,
           CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE payment_status = 'PAID') = count(*)
                THEN 'PAID' ELSE 'UNPAID' END AS status
    FROM public.tds_payment_allocations
    GROUP BY purchase_order_id
  ) agg
 WHERE r.purchase_order_id = agg.purchase_order_id
   AND COALESCE(r.payment_status, 'UNPAID') IS DISTINCT FROM agg.status;