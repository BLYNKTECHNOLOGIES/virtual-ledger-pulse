CREATE OR REPLACE FUNCTION public.hr_delete_fnf_settlement(p_settlement_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.hr_fnf_settlements;
  d public.hr_employee_deposits;
  l record;
  v_reason text := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_dep_released int := 0;
  v_dep_reopened int := 0;
  v_loans_reopened int := 0;
  v_pen_reopened int := 0;
  v_chk int := 0;
  v_paid numeric;
  v_out numeric;
  v_notes jsonb := '[]'::jsonb;
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to delete an F&F settlement';
  END IF;

  SELECT * INTO s FROM public.hr_fnf_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF s IS NULL THEN RAISE EXCEPTION 'F&F settlement % not found', p_settlement_id; END IF;

  IF s.razorpay_push_status = 'pushed' THEN
    RAISE EXCEPTION 'This settlement is already pushed to the RazorpayX payroll run. Remove the F&F addition/deduction in RazorpayX first, then delete it here.';
  END IF;

  -- ── Deposits / error recoveries this settlement reserved or closed ────────
  FOR d IN
    SELECT * FROM public.hr_employee_deposits
     WHERE fnf_settlement_id = p_settlement_id
     FOR UPDATE
  LOOP
    IF d.fnf_state = 'closed' OR COALESCE(d.is_settled, false) THEN
      INSERT INTO public.hr_deposit_transactions
        (employee_id, deposit_id, transaction_type, amount, balance_after,
         description, transaction_date, deposit_type, reference_id, period_month)
      VALUES (d.employee_id, d.id, 'released', COALESCE(d.collected_amount, 0), COALESCE(d.collected_amount, 0),
              'F&F settlement ' || p_settlement_id || ' deleted — reopened (was paid back '
                || COALESCE(d.refund_amount, 0) || ', withheld ' || COALESCE(d.withheld_amount, 0)
                || '). Reason: ' || v_reason,
              CURRENT_DATE, d.deposit_type, p_settlement_id::text, d.refund_period_month);

      UPDATE public.hr_employee_deposits
         SET is_settled = false,
             settled_at = NULL,
             current_balance = COALESCE(collected_amount, 0),
             refund_status = 'none',
             refund_amount = 0,
             withheld_amount = 0,
             withheld_reason = NULL,
             refunded_at = NULL,
             refund_period_month = NULL,
             fnf_settlement_id = NULL,
             fnf_state = 'none',
             settlement_notes = COALESCE(settlement_notes, '')
               || ' | F&F settlement ' || p_settlement_id || ' deleted — reopened. Reason: ' || v_reason,
             updated_at = now()
       WHERE id = d.id;
      v_dep_reopened := v_dep_reopened + 1;
      v_notes := v_notes || jsonb_build_object('deposit_id', d.id, 'deposit_type', d.deposit_type,
                                               'action', 'reopened', 'amount', COALESCE(d.collected_amount, 0));
    ELSE
      INSERT INTO public.hr_deposit_transactions
        (employee_id, deposit_id, transaction_type, amount, balance_after,
         description, transaction_date, deposit_type, reference_id)
      VALUES (d.employee_id, d.id, 'released', 0, COALESCE(d.current_balance, 0),
              'Released — F&F settlement ' || p_settlement_id || ' deleted. Reason: ' || v_reason,
              CURRENT_DATE, d.deposit_type, p_settlement_id::text);

      UPDATE public.hr_employee_deposits
         SET fnf_settlement_id = NULL, fnf_state = 'none', updated_at = now()
       WHERE id = d.id;
      v_dep_released := v_dep_released + 1;
      v_notes := v_notes || jsonb_build_object('deposit_id', d.id, 'deposit_type', d.deposit_type,
                                               'action', 'released', 'amount', COALESCE(d.current_balance, 0));
    END IF;
  END LOOP;

  -- ── Loans closed by this settlement ───────────────────────────────────────
  FOR l IN
    SELECT hl.* FROM public.hr_loans hl
     WHERE hl.id::text IN (
       SELECT jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'loan_ids', '[]'::jsonb))
     )
     FOR UPDATE
  LOOP
    IF l.notes IS NOT NULL AND l.notes LIKE '%' || p_settlement_id::text || '%' THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_paid
        FROM public.hr_loan_repayments
       WHERE loan_id = l.id AND status = 'paid';
      v_out := GREATEST(COALESCE(l.amount, 0) - v_paid, 0);

      UPDATE public.hr_loans
         SET outstanding_balance = v_out,
             status = CASE WHEN v_out > 0 THEN 'active' ELSE status END,
             notes = COALESCE(notes, '') || ' | F&F settlement ' || p_settlement_id
               || ' deleted — loan reopened with outstanding ' || v_out || '. Reason: ' || v_reason,
             updated_at = now()
       WHERE id = l.id;
      v_loans_reopened := v_loans_reopened + 1;
      v_notes := v_notes || jsonb_build_object('loan_id', l.id, 'action', 'reopened', 'outstanding', v_out);
    END IF;
  END LOOP;

  -- ── Penalties applied by this settlement ──────────────────────────────────
  UPDATE public.hr_penalties
     SET is_applied = false,
         applied_at = NULL,
         notes = COALESCE(notes, '') || ' | F&F settlement ' || p_settlement_id
           || ' deleted — penalty is open again. Reason: ' || v_reason,
         updated_at = now()
   WHERE id::text IN (
     SELECT jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'penalty_ids', '[]'::jsonb))
   )
     AND COALESCE(is_applied, false) = true
     AND COALESCE(notes, '') LIKE '%' || p_settlement_id::text || '%';
  GET DIAGNOSTICS v_pen_reopened = ROW_COUNT;

  -- ── Exit checklist: untick the F&F item ───────────────────────────────────
  UPDATE public.hr_resignation_checklist
     SET is_completed = false,
         completed_at = NULL,
         notes = COALESCE(notes, '') || ' | F&F settlement deleted on '
           || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST. Reason: ' || v_reason,
         updated_at = now()
   WHERE employee_id = s.employee_id
     AND lower(item_title) LIKE '%final settlement%'
     AND COALESCE(is_completed, false) = true;
  GET DIAGNOSTICS v_chk = ROW_COUNT;

  DELETE FROM public.hr_fnf_settlements WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'employee_id', s.employee_id,
    'status_was', s.status,
    'deposits_reopened', v_dep_reopened,
    'deposits_released', v_dep_released,
    'loans_reopened', v_loans_reopened,
    'penalties_reopened', v_pen_reopened,
    'checklist_unticked', v_chk,
    'details', v_notes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_delete_fnf_settlement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_delete_fnf_settlement(uuid, text) TO authenticated, service_role;