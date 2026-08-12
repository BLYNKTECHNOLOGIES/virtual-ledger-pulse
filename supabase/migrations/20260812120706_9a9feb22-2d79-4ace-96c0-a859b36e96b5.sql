-- 1. Status vocabulary: the state machine trigger already uses calculated/cancelled
ALTER TABLE public.hr_fnf_settlements DROP CONSTRAINT IF EXISTS chk_fnf_status;
ALTER TABLE public.hr_fnf_settlements
  ADD CONSTRAINT chk_fnf_status CHECK (status = ANY (ARRAY['draft','pending_approval','calculated','approved','paid','cancelled']));

-- 2. Push tracking
ALTER TABLE public.hr_fnf_settlements
  ADD COLUMN IF NOT EXISTS razorpay_push_status text NOT NULL DEFAULT 'not_pushed',
  ADD COLUMN IF NOT EXISTS razorpay_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_failure_reason text;

-- 3. Close every source record referenced by a settlement, in one transaction.
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
  v_deposits uuid[];
  v_loans_closed int := 0;
  v_pen_applied int := 0;
  v_dep_settled int := 0;
  d public.hr_employee_deposits;
  l_id uuid;
BEGIN
  SELECT * INTO s FROM public.hr_fnf_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF s IS NULL THEN RAISE EXCEPTION 'F&F settlement % not found', p_settlement_id; END IF;

  SELECT COALESCE(array_agg(x)::uuid[], '{}')
    INTO v_loans
    FROM jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'loan_ids','[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x)::uuid[], '{}')
    INTO v_penalties
    FROM jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'penalty_ids','[]'::jsonb)) x;
  SELECT COALESCE(array_agg(x)::uuid[], '{}')
    INTO v_deposits
    FROM jsonb_array_elements_text(COALESCE(s.breakdown->'source_ids'->'deposit_ids','[]'::jsonb)) x;

  -- Loans: cancel any leftover installments, then close at zero.
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

  -- Penalties: mark applied through the settlement.
  UPDATE public.hr_penalties
     SET is_applied = true, applied_at = now(), updated_at = now(),
         notes = COALESCE(notes,'') || ' | Deducted in F&F settlement ' || p_settlement_id
   WHERE id = ANY(v_penalties) AND is_applied = false;
  GET DIAGNOSTICS v_pen_applied = ROW_COUNT;

  -- Deposits: settle, drop pending installments, write the F&F ledger entry.
  FOR d IN SELECT * FROM public.hr_employee_deposits WHERE id = ANY(v_deposits) AND is_settled = false FOR UPDATE LOOP
    DELETE FROM public.hr_employee_deposit_schedule
     WHERE deposit_id = d.id AND status IN ('scheduled','failed');

    INSERT INTO public.hr_deposit_transactions
      (employee_id, deposit_id, transaction_type, amount, balance_after,
       description, transaction_date, deposit_type, reference_id)
    VALUES (d.employee_id, d.id, 'ff_refund', COALESCE(d.collected_amount,0), 0,
            'Settled through F&F settlement ' || p_settlement_id,
            CURRENT_DATE, d.deposit_type, p_settlement_id::text);

    UPDATE public.hr_employee_deposits
       SET is_settled = true,
           settled_at = now(),
           current_balance = 0,
           settlement_notes = COALESCE(settlement_notes,'') || ' | F&F settlement ' || p_settlement_id,
           updated_at = now()
     WHERE id = d.id;
    v_dep_settled := v_dep_settled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'loans_closed', v_loans_closed,
    'penalties_applied', v_pen_applied,
    'deposits_settled', v_dep_settled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_close_fnf_sources(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hr_close_fnf_sources(uuid) TO service_role, authenticated;