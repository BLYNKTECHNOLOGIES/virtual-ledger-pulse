-- 1) Rate is now DERIVED from the purchase order's actual TDS vs total amount.
CREATE OR REPLACE FUNCTION public.rebuild_tds_allocations(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_po IS NULL OR COALESCE(v_po.tds_applied, false) = false
     OR v_po.status = 'CANCELLED' OR COALESCE(v_po.tds_amount, 0) = 0 THEN
    DELETE FROM public.tds_payment_allocations WHERE purchase_order_id = p_po_id;
    RETURN;
  END IF;

  v_tds_total := v_po.tds_amount;
  v_binance   := COALESCE(v_po.bo_number, v_po.order_number);
  v_total_amt := COALESCE(NULLIF(v_po.total_amount, 0), 1);
  v_bank      := v_po.bank_account_id;

  SELECT financial_year INTO v_fy
  FROM public.tds_records WHERE purchase_order_id = p_po_id LIMIT 1;
  v_fy := COALESCE(v_fy, public.indian_financial_year(v_po.order_date));

  -- Derive the effective rate from the money actually deducted (source of truth).
  IF COALESCE(v_po.total_amount, 0) <> 0 THEN
    v_rate := round(v_tds_total / v_po.total_amount * 100, 4);
    -- Snap tiny rounding noise onto the canonical statutory rates.
    IF abs(v_rate - 1) < 0.05 THEN v_rate := 1;
    ELSIF abs(v_rate - 20) < 0.05 THEN v_rate := 20;
    END IF;
  ELSE
    SELECT tds_rate INTO v_rate FROM public.tds_records WHERE purchase_order_id = p_po_id LIMIT 1;
  END IF;

  -- Keep the stored TDS record aligned with the order (prevents future drift).
  UPDATE public.tds_records
  SET tds_rate = v_rate,
      tds_amount = v_tds_total,
      pan_number = COALESCE(v_po.pan_number, pan_number),
      updated_at = now()
  WHERE purchase_order_id = p_po_id
    AND (tds_rate IS DISTINCT FROM v_rate OR tds_amount IS DISTINCT FROM v_tds_total);

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
$function$;

-- 2) Backfill every allocation whose stored rate disagrees with the actual deduction.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT a.purchase_order_id
    FROM public.tds_payment_allocations a
    JOIN public.purchase_orders po ON po.id = a.purchase_order_id
    WHERE COALESCE(po.total_amount,0) <> 0
      AND abs(COALESCE(a.tds_rate,0) - round(po.tds_amount / po.total_amount * 100, 2)) > 0.05
  LOOP
    PERFORM public.rebuild_tds_allocations(r.purchase_order_id);
  END LOOP;
END $$;