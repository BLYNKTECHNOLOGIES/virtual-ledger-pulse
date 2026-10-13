-- 1. Policies
DROP POLICY IF EXISTS wf_plans_view ON public.hr_headcount_plans;
DROP POLICY IF EXISTS wf_plans_manage ON public.hr_headcount_plans;
DROP POLICY IF EXISTS wf_seats_view ON public.hr_seat_capacity;
DROP POLICY IF EXISTS wf_seats_manage ON public.hr_seat_capacity;
DROP POLICY IF EXISTS wf_req_view ON public.hr_hiring_requirements;
DROP POLICY IF EXISTS wf_req_manage ON public.hr_hiring_requirements;
DROP POLICY IF EXISTS wf_assump_view ON public.hr_workforce_forecast_assumptions;
DROP POLICY IF EXISTS wf_assump_manage ON public.hr_workforce_forecast_assumptions;
DROP POLICY IF EXISTS wf_audit_view ON public.hr_workforce_plan_audit;
DROP POLICY IF EXISTS wf_audit_insert ON public.hr_workforce_plan_audit;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_headcount_plans','hr_seat_capacity','hr_hiring_requirements','hr_workforce_forecast_assumptions'] LOOP
    EXECUTE format('CREATE POLICY wf_hr_read ON public.%I FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()))', t);
    EXECUTE format('CREATE POLICY wf_mgr_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.hr_wf_is_manager(auth.uid()))', t);
    EXECUTE format('CREATE POLICY wf_mgr_update ON public.%I FOR UPDATE TO authenticated USING (public.hr_wf_is_manager(auth.uid())) WITH CHECK (public.hr_wf_is_manager(auth.uid()))', t);
    EXECUTE format('CREATE POLICY wf_mgr_delete ON public.%I FOR DELETE TO authenticated USING (public.hr_wf_is_manager(auth.uid()))', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

CREATE POLICY wf_hr_read ON public.hr_workforce_plan_audit FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hr_workforce_plan_audit FROM authenticated, anon;
GRANT SELECT ON public.hr_workforce_plan_audit TO authenticated;
GRANT ALL ON public.hr_workforce_plan_audit TO service_role;

-- 2. Protected columns guard (SECURITY INVOKER: only browser roles are refused)
CREATE OR REPLACE FUNCTION public.hr_wf_guard_requirement_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.status,'') NOT IN ('draft','pending_approval') THEN
      RAISE EXCEPTION 'A new hiring requirement can only start as a draft or awaiting approval';
    END IF;
    IF coalesce(NEW.source,'manual') <> 'manual' THEN
      RAISE EXCEPTION 'Only manual hiring requirements can be created here';
    END IF;
    IF coalesce(NEW.positions_filled,0) <> 0 OR NEW.approver_id IS NOT NULL OR NEW.approver_name IS NOT NULL
       OR NEW.approved_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'A new hiring requirement cannot be pre-approved or pre-filled';
    END IF;
    NEW.source := 'manual';
    NEW.requirement_no := public.hr_next_hiring_requirement_no();
    NEW.requested_by := auth.uid();
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
     OR NEW.approver_name IS DISTINCT FROM OLD.approver_name
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.positions_filled IS DISTINCT FROM OLD.positions_filled
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.requirement_no IS DISTINCT FROM OLD.requirement_no THEN
    RAISE EXCEPTION 'Status, approval, filled count, source and number change only through the requirement actions';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_guard_requirement_columns() FROM PUBLIC, anon, authenticated;

-- Assign numbers for internal inserts that omit one
CREATE OR REPLACE FUNCTION public.hr_wf_assign_requirement_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.requirement_no IS NULL OR btrim(NEW.requirement_no) = '' THEN
    NEW.requirement_no := public.hr_next_hiring_requirement_no();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_assign_requirement_no() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a0_hr_wf_guard_requirement ON public.hr_hiring_requirements;
CREATE TRIGGER a0_hr_wf_guard_requirement BEFORE INSERT OR UPDATE ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_guard_requirement_columns();
DROP TRIGGER IF EXISTS a1_hr_wf_assign_requirement_no ON public.hr_hiring_requirements;
CREATE TRIGGER a1_hr_wf_assign_requirement_no BEFORE INSERT ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_assign_requirement_no();

CREATE OR REPLACE FUNCTION public.hr_wf_guard_plan_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.auto_paused_at IS NOT NULL OR NEW.auto_paused_by IS NOT NULL OR NEW.auto_paused_need IS NOT NULL
       OR NEW.auto_paused_by_name IS NOT NULL OR NEW.auto_paused_reason IS NOT NULL OR NEW.auto_paused_signature IS NOT NULL THEN
      RAISE EXCEPTION 'Automatic-request pause is set only by rejecting or cancelling a request';
    END IF;
  ELSIF NEW.auto_paused_at IS DISTINCT FROM OLD.auto_paused_at OR NEW.auto_paused_by IS DISTINCT FROM OLD.auto_paused_by
     OR NEW.auto_paused_need IS DISTINCT FROM OLD.auto_paused_need OR NEW.auto_paused_by_name IS DISTINCT FROM OLD.auto_paused_by_name
     OR NEW.auto_paused_reason IS DISTINCT FROM OLD.auto_paused_reason OR NEW.auto_paused_signature IS DISTINCT FROM OLD.auto_paused_signature THEN
    RAISE EXCEPTION 'Automatic-request pause changes only through Raise again or a rejection/cancellation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_guard_plan_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a0_hr_wf_guard_plan ON public.hr_headcount_plans;
CREATE TRIGGER a0_hr_wf_guard_plan BEFORE INSERT OR UPDATE ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_guard_plan_columns();

-- 3. Read functions: move bodies to internal cores, public wrappers check HR staff
DO $do$
DECLARE r record; v_def text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
     ('hr_workforce_staffing_matrix','hr_wf_staffing_matrix_core','', '', ''),
     ('hr_workforce_unplanned_scopes','hr_wf_unplanned_scopes_core','', '', ''),
     ('hr_requirement_pipeline','hr_wf_requirement_pipeline_core','p_requirement uuid','p_requirement','uuid')
  ) v(pub, core, args, callargs, types) LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', r.pub, r.types, r.core);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.core, r.types);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.core, r.types);
    EXECUTE format($f$CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $b$
      #variable_conflict use_column
      BEGIN
        IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR staff can view workforce planning' USING ERRCODE = '42501'; END IF;
        RETURN QUERY SELECT * FROM public.%I(%s);
      END $b$$f$, r.pub, r.args, pg_get_function_result(format('public.%I(%s)', r.core, r.types)::regprocedure), r.core, r.callargs);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.pub, r.types);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.pub, r.types);
  END LOOP;

  -- reconcile (internal, runs for any caller) uses the core directly
  v_def := pg_get_functiondef('public.hr_reconcile_capacity_hiring(boolean)'::regprocedure);
  v_def := replace(v_def, 'hr_workforce_staffing_matrix(', 'hr_wf_staffing_matrix_core(');
  EXECUTE v_def;
END $do$;

-- 4. Not browser-callable
REVOKE EXECUTE ON FUNCTION public.hr_next_hiring_requirement_no() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_hiring_requirement_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_sync_requirement_fulfilment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_next_hiring_requirement_no() TO service_role;