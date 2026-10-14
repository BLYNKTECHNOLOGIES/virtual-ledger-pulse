-- ============================================================================
-- LMS step 3: safety checks, certification undo history, and an atomic
-- "extend / push back" for training plans. LMS objects only.
-- ============================================================================

-- Links stored in the LMS must be web addresses (no javascript: or data: links).
ALTER TABLE public.lms_module_assets
  ADD CONSTRAINT lms_module_assets_external_url_chk CHECK (external_url IS NULL OR external_url ~* '^https?://');
ALTER TABLE public.lms_kras
  ADD CONSTRAINT lms_kras_description_url_chk CHECK (description_url IS NULL OR description_url ~* '^https?://');

-- A re-certification in a later plan keeps the certification it replaced, so undo can restore it.
ALTER TABLE public.lms_certifications ADD COLUMN IF NOT EXISTS previous jsonb;

-- Moves a plan's days in one transaction.
--   mode 'extend': adds _days right after the last module day (live days move back), fills them with
--                  revision and, if _retest, ends them with a retest; the plan's module, total and
--                  extension days grow by _days.
--   mode 'shift':  pushes every item from _from_day onwards back by _days (absence, holiday, weekly off).
-- Runs with the caller's rights, so the LMS row-level policies still decide who may change a plan.
CREATE OR REPLACE FUNCTION public.lms_shift_plan(_plan_id uuid, _mode text, _days integer, _from_day integer DEFAULT NULL, _retest boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  p public.lms_plans%ROWTYPE;
  v_from integer;
  v_attempt integer;
  v_last integer;
  d integer;
BEGIN
  IF NOT public.lms_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: LMS manage permission required';
  END IF;
  IF _mode IS NULL OR _mode NOT IN ('extend', 'shift') THEN
    RAISE EXCEPTION 'Unknown mode %', _mode;
  END IF;
  IF _days IS NULL OR _days < 1 OR _days > 60 THEN
    RAISE EXCEPTION 'Days must be between 1 and 60';
  END IF;

  SELECT * INTO p FROM public.lms_plans WHERE id = _plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training plan not found';
  END IF;

  SELECT coalesce(max(day_no), 0) INTO v_last FROM public.lms_plan_items WHERE plan_id = _plan_id;
  IF greatest(p.total_days, v_last) + _days > 240 THEN
    RAISE EXCEPTION 'A plan cannot be longer than 240 days';
  END IF;

  IF _mode = 'extend' THEN
    IF p.module_days + _days > 180 THEN
      RAISE EXCEPTION 'Module days cannot go past 180';
    END IF;
    IF p.extension_days + _days > 120 THEN
      RAISE EXCEPTION 'A plan cannot be extended by more than 120 days in all';
    END IF;
    v_from := p.module_days + 1;
  ELSE
    v_from := coalesce(_from_day, 1);
    IF v_from < 1 OR v_from > greatest(p.total_days, v_last) THEN
      RAISE EXCEPTION 'Pick a day between 1 and %', greatest(p.total_days, v_last);
    END IF;
    IF v_from <= p.module_days AND p.module_days + _days > 180 THEN
      RAISE EXCEPTION 'Module days cannot go past 180';
    END IF;
  END IF;

  UPDATE public.lms_plan_items SET day_no = day_no + _days WHERE plan_id = _plan_id AND day_no >= v_from;

  IF _mode = 'extend' THEN
    SELECT coalesce(max(test_attempt), 1) INTO v_attempt FROM public.lms_plan_items WHERE plan_id = _plan_id AND item_type = 'test';
    FOR d IN v_from .. v_from + _days - 1 LOOP
      IF d = v_from + _days - 1 AND _retest THEN
        INSERT INTO public.lms_plan_items (plan_id, day_no, sort_order, item_type, title, recorded_by)
        VALUES (_plan_id, d, 10, 'practice', 'Revision before the retest', auth.uid());
        INSERT INTO public.lms_plan_items (plan_id, day_no, sort_order, item_type, title, test_kind, test_attempt, recorded_by)
        VALUES (_plan_id, d, 20, 'test', 'Retest', 'retest', v_attempt + 1, auth.uid());
      ELSE
        INSERT INTO public.lms_plan_items (plan_id, day_no, sort_order, item_type, title, recorded_by)
        VALUES (_plan_id, d, 10, 'practice', 'Extended training: revision and supervised practice', auth.uid());
      END IF;
    END LOOP;
    UPDATE public.lms_plans
    SET module_days = module_days + _days, total_days = greatest(total_days, v_last) + _days, extension_days = extension_days + _days
    WHERE id = _plan_id;
  ELSE
    UPDATE public.lms_plans
    SET total_days = greatest(total_days, v_last) + _days,
        module_days = CASE WHEN v_from <= module_days THEN module_days + _days ELSE module_days END
    WHERE id = _plan_id;
  END IF;

  RETURN jsonb_build_object('from_day', v_from, 'days', _days);
END $$;
REVOKE EXECUTE ON FUNCTION public.lms_shift_plan(uuid, text, integer, integer, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lms_shift_plan(uuid, text, integer, integer, boolean) TO authenticated, service_role;