ALTER TABLE public.hr_employee_deposits
  ADD COLUMN IF NOT EXISTS fnf_settlement_id uuid,
  ADD COLUMN IF NOT EXISTS fnf_state text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  ALTER TABLE public.hr_employee_deposits
    ADD CONSTRAINT hr_employee_deposits_fnf_state_chk
    CHECK (fnf_state = ANY (ARRAY['none','reserved','closed']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_hr_employee_deposits_fnf ON public.hr_employee_deposits (fnf_settlement_id);

ALTER TABLE public.hr_employee_deposits DROP CONSTRAINT IF EXISTS hr_employee_deposits_refund_status_chk;
ALTER TABLE public.hr_employee_deposits
  ADD CONSTRAINT hr_employee_deposits_refund_status_chk
  CHECK (refund_status = ANY (ARRAY['none','refunded','withheld']));

ALTER TABLE public.hr_deposit_transactions DROP CONSTRAINT IF EXISTS hr_deposit_transactions_transaction_type_check;
ALTER TABLE public.hr_deposit_transactions
  ADD CONSTRAINT hr_deposit_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY['collection','penalty_deduction','replenishment','ff_refund','initiated','modified','paused','resumed','completed','refund','withheld','reserved','released','ff_settlement']));

-- Reserve / release the deposits a settlement governs. Idempotent.
CREATE OR REPLACE FUNCTION public.hr_apply_fnf_deposit_reservations(p_settlement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s public.hr_fnf_settlements;
  v_ids uuid[];
  v_conflict text;
  v_res int := 0;
  v_rel int := 0;
BEGIN
  SELECT * INTO s FROM public.hr_fnf_settlements WHERE id = p_settlement_id;
  IF s IS NULL THEN RAISE EXCEPTION 'F&F settlement % not found', p_settlement_id; END IF;

  IF s.status = 'cancelled' THEN
    UPDATE public.hr_employee_deposits
       SET fnf_settlement_id = NULL, fnf_state = 'none', updated_at = now()
     WHERE fnf_settlement_id = p_settlement_id AND fnf_state = 'reserved';
    GET DIAGNOSTICS v_rel = ROW_COUNT;
    RETURN jsonb_build_object('reserved', 0, 'released', v_rel);
  END IF;

  SELECT COALESCE(array_agg((x->>'deposit_id')::uuid), '{}')
    INTO v_ids
    FROM jsonb_array_elements(COALESCE(s.breakdown->'deposit_decisions', '[]'::jsonb)) x;

  -- Never steal a deposit governed by a different live settlement.
  SELECT string_agg(id::text, ', ') INTO v_conflict
    FROM public.hr_employee_deposits
   WHERE id = ANY(v_ids)
     AND fnf_settlement_id IS NOT NULL
     AND fnf_settlement_id <> p_settlement_id
     AND fnf_state <> 'none';
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'Deposit(s) % are already reserved by another F&F settlement', v_conflict;
  END IF;

  UPDATE public.hr_employee_deposits
     SET fnf_settlement_id = NULL, fnf_state = 'none', updated_at = now()
   WHERE fnf_settlement_id = p_settlement_id
     AND fnf_state = 'reserved'
     AND NOT (id = ANY(v_ids));
  GET DIAGNOSTICS v_rel = ROW_COUNT;

  UPDATE public.hr_employee_deposits
     SET fnf_settlement_id = p_settlement_id, fnf_state = 'reserved', updated_at = now()
   WHERE id = ANY(v_ids)
     AND COALESCE(is_settled, false) = false
     AND COALESCE(fnf_state, 'none') <> 'closed';
  GET DIAGNOSTICS v_res = ROW_COUNT;

  RETURN jsonb_build_object('reserved', v_res, 'released', v_rel);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_apply_fnf_deposit_reservations(uuid) TO authenticated, service_role;

-- Close every source record a settlement recovered/refunded, honouring the
-- per-deposit refund / withheld decision recorded in the settlement.
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
      VALUES (d.employee_id, d.id, 'withheld', 0, 0,
              'Withheld at exit (F&F ' || p_settlement_id || ') — ' || COALESCE(v_reason,'no reason recorded'),
              CURRENT_DATE, d.deposit_type, p_settlement_id::text, v_period);
    END IF;

    UPDATE public.hr_employee_deposits
       SET is_settled = true,
           settled_at = now(),
           current_balance = 0,
           refund_status = CASE WHEN v_refund > 0 THEN 'refunded' ELSE 'withheld' END,
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

  -- Legacy settlements (created before per-deposit decisions) refund in full.
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

GRANT EXECUTE ON FUNCTION public.hr_close_fnf_sources(uuid) TO authenticated, service_role;