CREATE OR REPLACE FUNCTION public.hr_assert_fnf_reasons(p_breakdown jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  dec jsonb;
  v_missing text;
BEGIN
  SELECT string_agg(COALESCE(x->>'label', x->>'deposit_id'), ', ')
    INTO v_missing
    FROM jsonb_array_elements(COALESCE(p_breakdown->'deposit_decisions','[]'::jsonb)) x
   WHERE ROUND(GREATEST(COALESCE((x->>'held')::numeric,0) - COALESCE((x->>'refund')::numeric,0), 0), 2) > 0
     AND NULLIF(TRIM(COALESCE(x->>'reason','')), '') IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'A written reason is required for every deposit/error recovery that is not paid back in full: %', v_missing
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_fnf_require_withheld_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.status,'draft') <> 'cancelled' THEN
    PERFORM public.hr_assert_fnf_reasons(COALESCE(NEW.breakdown, '{}'::jsonb));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_fnf_require_withheld_reason ON public.hr_fnf_settlements;
CREATE TRIGGER trg_hr_fnf_require_withheld_reason
BEFORE INSERT OR UPDATE ON public.hr_fnf_settlements
FOR EACH ROW EXECUTE FUNCTION public.hr_fnf_require_withheld_reason();

CREATE OR REPLACE FUNCTION public.hr_close_fnf_sources(p_settlement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.hr_fnf_settlements;
  v_loans uuid[];
  v_penalties uuid[];
  v_loans_closed int := 0;
  v_pen_applied int := 0;
  v_dep_settled int := 0;
  dec jsonb;
  d public.hr_employee_deposits;
  l_id uuid;
  v_refund numeric;
  v_withheld numeric;
  v_reason text;
  v_period date;
BEGIN
  SELECT * INTO s FROM public.hr_fnf_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF s IS NULL THEN RAISE EXCEPTION 'F&F settlement % not found', p_settlement_id; END IF;
  v_period := date_trunc('month', COALESCE(s.last_working_day, CURRENT_DATE))::date;

  -- Money kept at exit can never be closed without a written reason.
  PERFORM public.hr_assert_fnf_reasons(COALESCE(s.breakdown, '{}'::jsonb));

  SELECT COALESCE(array_agg(x)::uuid[], '{}') INTO v_loans
    FROM jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'loan_ids','[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x)::uuid[], '{}') INTO v_penalties
    FROM jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'penalty_ids','[]'::jsonb)) x;

  FOREACH l_id IN ARRAY v_loans LOOP
    DELETE FROM public.hr_loan_repayments
     WHERE loan_id = l_id AND status IN ('scheduled','failed');
    UPDATE public.hr_loans
       SET outstanding_balance = 0,
           status = CASE WHEN status IN ('active','paused','approved') THEN 'closed' ELSE status END,
           notes = COALESCE(notes,'') || ' | Recovered in full via F&F settlement ' || p_settlement_id,
           updated_at = now()
     WHERE id = l_id AND status <> 'closed';
    IF FOUND THEN v_loans_closed := v_loans_closed + 1; END IF;
  END LOOP;

  UPDATE public.hr_penalties
     SET is_applied = true, applied_at = now(), updated_at = now(),
         notes = COALESCE(notes,'') || ' | Deducted in F&F settlement ' || p_settlement_id
   WHERE id = ANY(v_penalties) AND is_applied = false;
  GET DIAGNOSTICS v_pen_applied = ROW_COUNT;

  FOR dec IN
    SELECT x FROM jsonb_array_elements(COALESCE(s.breakdown->'deposit_decisions','[]'::jsonb)) x
  LOOP
    SELECT * INTO d FROM public.hr_employee_deposits
     WHERE id = (dec->>'deposit_id')::uuid AND COALESCE(is_settled,false) = false
     FOR UPDATE;
    CONTINUE WHEN d IS NULL;

    v_refund   := ROUND(COALESCE((dec->>'refund')::numeric, 0), 2);
    v_withheld := ROUND(GREATEST(COALESCE(d.collected_amount,0) - v_refund, 0), 2);
    v_reason   := NULLIF(TRIM(COALESCE(dec->>'reason','')), '');

    IF v_withheld > 0 AND v_reason IS NULL THEN
      RAISE EXCEPTION 'A written reason is required before keeping % on deposit %', v_withheld, d.id
        USING ERRCODE = 'check_violation';
    END IF;

    DELETE FROM public.hr_employee_deposit_schedule
     WHERE deposit_id = d.id AND status IN ('scheduled','failed');

    IF v_refund > 0 THEN
      INSERT INTO public.hr_deposit_transactions
        (employee_id, deposit_id, transaction_type, amount, balance_after,
         description, transaction_date, deposit_type, reference_id, period_month)
      VALUES (d.employee_id, d.id, 'ff_refund', -v_refund, v_withheld,
              'Paid back in F&F settlement ' || p_settlement_id,
              CURRENT_DATE, d.deposit_type, p_settlement_id::text, v_period);
    END IF;

    IF v_withheld > 0 THEN
      INSERT INTO public.hr_deposit_transactions
        (employee_id, deposit_id, transaction_type, amount, balance_after,
         description, transaction_date, deposit_type, reference_id, period_month)
      VALUES (d.employee_id, d.id, 'withheld', v_withheld, 0,
              'Withheld at exit (F&F ' || p_settlement_id || ') — ' || v_reason,
              CURRENT_DATE, d.deposit_type, p_settlement_id::text, v_period);
    END IF;

    UPDATE public.hr_employee_deposits
       SET is_settled = true,
           settled_at = now(),
           current_balance = 0,
           refund_status = CASE
             WHEN v_refund > 0 AND v_withheld > 0 THEN 'partial'
             WHEN v_refund > 0 THEN 'refunded'
             ELSE 'withheld' END,
           refund_amount = v_refund,
           withheld_amount = v_withheld,
           withheld_reason = CASE WHEN v_withheld > 0 THEN v_reason ELSE withheld_reason END,
           refunded_at = now(),
           refund_period_month = v_period,
           is_recovered = CASE WHEN d.deposit_type = 'error_recovery' AND v_refund > 0 THEN true ELSE is_recovered END,
           recovered_at = CASE WHEN d.deposit_type = 'error_recovery' AND v_refund > 0 THEN now() ELSE recovered_at END,
           fnf_settlement_id = p_settlement_id,
           fnf_state = 'closed',
           settlement_notes = COALESCE(settlement_notes,'') || ' | F&F settlement ' || p_settlement_id
             || ' — paid back ' || v_refund || ', withheld ' || v_withheld
             || COALESCE(' (' || v_reason || ')', ''),
           updated_at = now()
     WHERE id = d.id;
    v_dep_settled := v_dep_settled + 1;
  END LOOP;

  IF v_dep_settled = 0 THEN
    FOR d IN
      SELECT dd.* FROM public.hr_employee_deposits dd
       WHERE dd.id::text IN (
         SELECT jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'deposit_ids','[]'::jsonb))
       ) AND COALESCE(dd.is_settled,false) = false
       FOR UPDATE
    LOOP
      DELETE FROM public.hr_employee_deposit_schedule
       WHERE deposit_id = d.id AND status IN ('scheduled','failed');
      INSERT INTO public.hr_deposit_transactions
        (employee_id, deposit_id, transaction_type, amount, balance_after,
         description, transaction_date, deposit_type, reference_id)
      VALUES (d.employee_id, d.id, 'ff_refund', -COALESCE(d.collected_amount,0), 0,
              'Settled through F&F settlement ' || p_settlement_id,
              CURRENT_DATE, d.deposit_type, p_settlement_id::text);
      UPDATE public.hr_employee_deposits
         SET is_settled = true, settled_at = now(), current_balance = 0,
             refund_status = 'refunded', refund_amount = COALESCE(d.collected_amount,0),
             refunded_at = now(), fnf_settlement_id = p_settlement_id, fnf_state = 'closed',
             settlement_notes = COALESCE(settlement_notes,'') || ' | F&F settlement ' || p_settlement_id,
             updated_at = now()
       WHERE id = d.id;
      v_dep_settled := v_dep_settled + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'loans_closed', v_loans_closed,
    'penalties_applied', v_pen_applied,
    'deposits_settled', v_dep_settled
  );
END;
$function$;