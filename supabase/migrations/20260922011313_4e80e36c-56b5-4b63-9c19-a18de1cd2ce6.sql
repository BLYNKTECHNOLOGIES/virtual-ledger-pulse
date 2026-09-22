ALTER TABLE public.hr_seat_capacity
ADD COLUMN is_training_only boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.hr_validate_seat_capacity_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_training_only THEN
    IF NEW.position_id IS NOT NULL OR NEW.max_operational_capacity IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'Training-only capacity cannot be role-assigned or counted as operational work capacity';
    END IF;
    IF NEW.shift_id IS NULL THEN
      RAISE EXCEPTION 'Training-only capacity must be linked to a training shift';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_validate_seat_capacity_kind ON public.hr_seat_capacity;
CREATE TRIGGER trg_hr_validate_seat_capacity_kind
BEFORE INSERT OR UPDATE OF is_training_only, position_id, shift_id, max_operational_capacity
ON public.hr_seat_capacity
FOR EACH ROW EXECUTE FUNCTION public.hr_validate_seat_capacity_kind();

CREATE OR REPLACE FUNCTION public.hr_reconcile_capacity_hiring(p_sync_plans boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  capacity_row record;
  matrix_row record;
  existing_plan_id uuid;
  pending_auto_id uuid;
  pending_auto_outstanding integer;
  committed_open integer;
  remaining_need integer;
  desired_auto integer;
  plans_created integer := 0;
  plans_updated integer := 0;
  requirements_created integer := 0;
  requirements_updated integer := 0;
  requirements_cancelled integer := 0;
  requirement_number text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));

  IF p_sync_plans THEN
    FOR capacity_row IN
      SELECT sc.department_id,
             sc.position_id,
             sc.shift_id,
             sc.location,
             max(sc.shift_label) AS shift_label,
             sum(coalesce(sc.max_operational_capacity, sc.physical_seats))::int AS operational_target
      FROM public.hr_seat_capacity sc
      WHERE sc.is_active
        AND NOT sc.is_training_only
        AND sc.position_id IS NOT NULL
      GROUP BY sc.department_id, sc.position_id, sc.shift_id, sc.location
    LOOP
      SELECT hp.id INTO existing_plan_id
      FROM public.hr_headcount_plans hp
      WHERE hp.is_active
        AND hp.department_id IS NOT DISTINCT FROM capacity_row.department_id
        AND hp.position_id IS NOT DISTINCT FROM capacity_row.position_id
        AND hp.shift_id IS NOT DISTINCT FROM capacity_row.shift_id
        AND coalesce(hp.location, '-') = coalesce(capacity_row.location, '-')
      LIMIT 1;

      IF existing_plan_id IS NULL THEN
        INSERT INTO public.hr_headcount_plans (
          department_id, position_id, shift_id, shift_label, location,
          approved_hc, required_hc, priority, notes
        ) VALUES (
          capacity_row.department_id, capacity_row.position_id, capacity_row.shift_id,
          capacity_row.shift_label, capacity_row.location,
          capacity_row.operational_target, capacity_row.operational_target,
          'high', 'System-created from operational seat capacity; policy target is 100% occupancy.'
        )
        RETURNING id INTO existing_plan_id;
        plans_created := plans_created + 1;
      ELSE
        UPDATE public.hr_headcount_plans hp
        SET approved_hc = greatest(hp.approved_hc, capacity_row.operational_target),
            required_hc = greatest(hp.required_hc, capacity_row.operational_target)
        WHERE hp.id = existing_plan_id
          AND (hp.approved_hc < capacity_row.operational_target OR hp.required_hc < capacity_row.operational_target);
        IF FOUND THEN plans_updated := plans_updated + 1; END IF;
      END IF;
    END LOOP;
  END IF;

  FOR matrix_row IN SELECT * FROM public.hr_workforce_staffing_matrix()
  LOOP
    remaining_need := greatest(
      matrix_row.required_hc - matrix_row.current_hc
      - matrix_row.selected_hc - matrix_row.pending_joining_hc,
      0
    );

    SELECT hr.id, greatest(hr.number_required - hr.positions_filled, 0)
      INTO pending_auto_id, pending_auto_outstanding
    FROM public.hr_hiring_requirements hr
    WHERE hr.staffing_plan_id = matrix_row.plan_id
      AND hr.source = 'capacity_occupancy'
      AND hr.status = 'pending_approval'
    LIMIT 1;

    committed_open := greatest(
      matrix_row.open_requirement_hc - coalesce(pending_auto_outstanding, 0),
      0
    );
    desired_auto := greatest(remaining_need - committed_open, 0);

    IF pending_auto_id IS NOT NULL THEN
      IF desired_auto = 0 THEN
        UPDATE public.hr_hiring_requirements
        SET status = 'cancelled',
            notes = concat_ws(E'\n', nullif(notes,''), 'System-cancelled: the live shortage is now covered.')
        WHERE id = pending_auto_id;
        requirements_cancelled := requirements_cancelled + 1;
      ELSE
        UPDATE public.hr_hiring_requirements
        SET number_required = desired_auto,
            department_id = matrix_row.department_id,
            position_id = matrix_row.position_id,
            shift_id = matrix_row.shift_id,
            shift_label = matrix_row.shift_name,
            location = matrix_row.location,
            employment_type = matrix_row.employment_type,
            target_joining_date = matrix_row.target_date,
            priority = CASE WHEN matrix_row.required_hc > 0
                                  AND (desired_auto::numeric / matrix_row.required_hc) >= 0.20
                             THEN 'critical' ELSE matrix_row.priority END,
            reason_notes = format(
              '100%% operational occupancy: required %s, peak on roll %s, selected %s, joining pending %s, other open hiring %s.',
              matrix_row.required_hc, matrix_row.current_hc, matrix_row.selected_hc,
              matrix_row.pending_joining_hc, committed_open
            )
        WHERE id = pending_auto_id
          AND (number_required IS DISTINCT FROM desired_auto
            OR department_id IS DISTINCT FROM matrix_row.department_id
            OR position_id IS DISTINCT FROM matrix_row.position_id
            OR shift_id IS DISTINCT FROM matrix_row.shift_id);
        IF FOUND THEN requirements_updated := requirements_updated + 1; END IF;
      END IF;
    ELSIF desired_auto > 0 THEN
      requirement_number := public.hr_next_hiring_requirement_no();
      INSERT INTO public.hr_hiring_requirements (
        requirement_no, staffing_plan_id, source,
        department_id, position_id, shift_id, shift_label, location, employment_type,
        number_required, target_joining_date, reason, reason_notes,
        requested_by_name, approver_name, priority, status, notes
      ) VALUES (
        requirement_number, matrix_row.plan_id, 'capacity_occupancy',
        matrix_row.department_id, matrix_row.position_id, matrix_row.shift_id,
        matrix_row.shift_name, matrix_row.location, matrix_row.employment_type,
        desired_auto, matrix_row.target_date, 'increased_workload',
        format(
          '100%% operational occupancy: required %s, peak on roll %s, selected %s, joining pending %s, other open hiring %s.',
          matrix_row.required_hc, matrix_row.current_hc, matrix_row.selected_hc,
          matrix_row.pending_joining_hc, committed_open
        ),
        'Workforce Planning System', 'HR Manager',
        CASE WHEN matrix_row.required_hc > 0
                  AND (desired_auto::numeric / matrix_row.required_hc) >= 0.20
             THEN 'critical' ELSE matrix_row.priority END,
        'pending_approval',
        'System-generated for an uncovered capacity-backed staffing shortage. HR approval is required before recruitment.'
      );
      requirements_created := requirements_created + 1;
    END IF;

    pending_auto_id := NULL;
    pending_auto_outstanding := 0;
  END LOOP;

  RETURN jsonb_build_object(
    'plans_created', plans_created,
    'plans_updated', plans_updated,
    'requirements_created', requirements_created,
    'requirements_updated', requirements_updated,
    'requirements_cancelled', requirements_cancelled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) TO service_role;