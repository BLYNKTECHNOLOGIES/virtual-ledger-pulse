
-- ============ 1. Pause record on lines ============
ALTER TABLE public.hr_headcount_plans
  ADD COLUMN IF NOT EXISTS auto_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_paused_by uuid,
  ADD COLUMN IF NOT EXISTS auto_paused_by_name text,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text,
  ADD COLUMN IF NOT EXISTS auto_paused_need integer,
  ADD COLUMN IF NOT EXISTS auto_paused_signature text;

CREATE OR REPLACE FUNCTION public.hr_wf_line_signature(p_plan uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(concat_ws('|', p.required_hc, p.approved_hc, p.seat_capacity_id,
    array_to_string(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids), ','),
    array_to_string(public.hr_wf_roles(p.position_id, p.eligible_position_ids), ',')))
  FROM public.hr_headcount_plans p WHERE p.id = p_plan
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_user_name(p_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_uid IS NULL THEN 'System' ELSE coalesce(
    (SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, u.email) FROM public.users u WHERE u.id = p_uid),
    'Unknown user') END
$$;

-- ============ 2. Audit: System attribution + own reasons ============
CREATE OR REPLACE FUNCTION public.hr_wf_audit_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN
    NEW.changed_by := NULL; NEW.changed_by_name := 'System'; RETURN NEW;
  END IF;
  NEW.changed_by := coalesce(NEW.changed_by, auth.uid());
  IF coalesce(btrim(NEW.changed_by_name), '') = '' THEN NEW.changed_by_name := public.hr_wf_user_name(NEW.changed_by); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_audit_headcount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a uuid := auth.uid(); v_sys boolean := coalesce(current_setting('hr.wf_reconciling', true), '') = '1';
  v_r text := nullif(current_setting('hr.wf_change_reason', true), ''); v_hc text;
BEGIN
  IF v_sys THEN a := NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', OLD.id, 'Line removed', format('Approved %s / Required %s', OLD.approved_hc, OLD.required_hc), NULL, coalesce(v_r, OLD.notes), a);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Plan created', NULL,
      format('%s · Approved %s / Required %s', public.hr_wf_shift_label(NEW.shift_id, NEW.eligible_shift_ids), NEW.approved_hc, NEW.required_hc), coalesce(v_r, NEW.notes), a);
    RETURN NEW;
  END IF;
  -- desk-follow sync (system or seat edit) gets its own reason, never the line's old notes
  v_hc := CASE WHEN NEW.follow_desks AND OLD.follow_desks AND NEW.seat_capacity_id IS NOT DISTINCT FROM OLD.seat_capacity_id
                    AND NEW.notes IS NOT DISTINCT FROM OLD.notes
               THEN format('Desks changed: %s → %s', OLD.required_hc, NEW.required_hc) END;
  IF NEW.approved_hc IS DISTINCT FROM OLD.approved_hc THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Approved HC', OLD.approved_hc::text, NEW.approved_hc::text, coalesce(v_hc, v_r, NEW.notes), a);
  END IF;
  IF NEW.required_hc IS DISTINCT FROM OLD.required_hc THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Required HC', OLD.required_hc::text, NEW.required_hc::text, coalesce(v_hc, v_r, NEW.notes), a);
  END IF;
  IF NEW.shift_id IS DISTINCT FROM OLD.shift_id OR NEW.eligible_shift_ids IS DISTINCT FROM OLD.eligible_shift_ids THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Shift', public.hr_wf_shift_label(OLD.shift_id, OLD.eligible_shift_ids),
            public.hr_wf_shift_label(NEW.shift_id, NEW.eligible_shift_ids), coalesce(v_r, NEW.notes), a);
  END IF;
  IF NEW.position_id IS DISTINCT FROM OLD.position_id OR NEW.eligible_position_ids IS DISTINCT FROM OLD.eligible_position_ids THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Roles',
      (SELECT string_agg(title, ' / ') FROM public.positions WHERE id = ANY(public.hr_wf_roles(OLD.position_id, OLD.eligible_position_ids))),
      (SELECT string_agg(title, ' / ') FROM public.positions WHERE id = ANY(public.hr_wf_roles(NEW.position_id, NEW.eligible_position_ids))),
      coalesce(v_r, NEW.notes), a);
  END IF;
  IF NEW.follow_desks IS DISTINCT FROM OLD.follow_desks THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Follow desks', OLD.follow_desks::text, NEW.follow_desks::text, coalesce(v_r, NEW.notes), a);
  END IF;
  IF NEW.seat_capacity_id IS DISTINCT FROM OLD.seat_capacity_id THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, 'Desk group', OLD.seat_capacity_id::text, NEW.seat_capacity_id::text, coalesce(v_r, NEW.notes), a);
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, CASE WHEN NEW.is_active THEN 'Line reactivated' ELSE 'Line deactivated' END,
            OLD.is_active::text, NEW.is_active::text, coalesce(v_r, NEW.notes), a);
  END IF;
  IF NEW.auto_paused_at IS DISTINCT FROM OLD.auto_paused_at THEN
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('headcount_plan', NEW.id, CASE WHEN NEW.auto_paused_at IS NULL THEN 'Automatic hiring resumed' ELSE 'Automatic hiring paused' END,
            NULL, CASE WHEN NEW.auto_paused_at IS NOT NULL THEN format('Declined %s', NEW.auto_paused_need) END,
            CASE WHEN NEW.auto_paused_at IS NULL THEN coalesce(v_r, 'Line changed or shortage grew') ELSE NEW.auto_paused_reason END, a);
  END IF;
  RETURN NEW;
END $$;

-- follow desks: inactive desk group keeps the line following (0 desks), never silently switched off
CREATE OR REPLACE FUNCTION public.hr_wf_follow_desks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF NEW.follow_desks THEN
    IF NEW.seat_capacity_id IS NULL THEN RAISE EXCEPTION 'Pick the desk group this line follows, or switch off "follow desks".'; END IF;
    SELECT CASE WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END
      INTO v FROM public.hr_seat_capacity sc WHERE sc.id = NEW.seat_capacity_id;
    NEW.approved_hc := coalesce(v, 0);
    NEW.required_hc := coalesce(v, 0);
  END IF;
  RETURN NEW;
END $$;

-- ============ 3. One count per onboarding record ============
CREATE OR REPLACE FUNCTION public.hr_wf_onboarding_people()
RETURNS TABLE(onboarding_id uuid, requirement_id uuid, plan_id uuid, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH lines AS (
  SELECT p.id, p.department_id, public.hr_wf_roles(p.position_id, p.eligible_position_ids) AS roles,
         public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) AS groups
  FROM public.hr_headcount_plans p WHERE p.is_active
),
o AS (
  SELECT o.id, o.status, o.date_of_joining, o.employee_id,
    coalesce(e.is_active, false) AS emp_active,
    (o.status = 'completed' AND o.employee_id IS NOT NULL AND NOT coalesce(e.is_active, false)
      AND coalesce(e.resignation_status, '') = '' AND e.last_working_day IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_daily d WHERE d.employee_id = o.employee_id)) AS awaiting_activation,
    j.requisition_id AS rid, rq.staffing_plan_id AS rq_plan,
    coalesce(o.department_id, rq.department_id) AS dept, coalesce(o.position_id, rq.position_id) AS pos,
    public.hr_wf_planning_shift(coalesce(o.post_training_shift_id, o.shift_id, rq.shift_id)) AS grp
  FROM public.hr_employee_onboarding o
  LEFT JOIN public.hr_employees e ON e.id = o.employee_id
  LEFT JOIN public.ats_applications a ON a.id = o.ats_application_id
  LEFT JOIN public.ats_jobs j ON j.id = a.job_id
  LEFT JOIN public.hr_hiring_requirements rq ON rq.id = j.requisition_id
  WHERE o.status <> 'cancelled'
)
SELECT o.id, o.rid,
  coalesce((SELECT l.id FROM lines l WHERE l.id = o.rq_plan),
           (SELECT l.id FROM lines l WHERE l.department_id IS NOT DISTINCT FROM o.dept AND o.pos = ANY(l.roles)
              AND (cardinality(l.groups) = 0 OR o.grp = ANY(l.groups))
            ORDER BY cardinality(l.groups) DESC, l.id LIMIT 1)),
  CASE
    WHEN o.emp_active THEN CASE WHEN o.status = 'completed' THEN 'joined' ELSE 'on_roll' END
    WHEN o.status = 'completed' THEN CASE WHEN o.awaiting_activation THEN 'joining'
                                          WHEN o.employee_id IS NOT NULL THEN 'joined' ELSE 'gone' END
    WHEN o.date_of_joining IS NOT NULL THEN 'joining'
    ELSE 'selected' END
FROM o
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_requirement_people(p_requirement uuid DEFAULT NULL)
RETURNS TABLE(requirement_id uuid, pipeline_hc integer, selected_hc integer, joining_hc integer, joined_hc integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH ob AS (
  SELECT op.requirement_id rid,
    count(*) FILTER (WHERE op.state = 'selected')::int sel,
    count(*) FILTER (WHERE op.state = 'joining')::int jn,
    count(*) FILTER (WHERE op.state = 'joined')::int jd
  FROM public.hr_wf_onboarding_people() op
  WHERE op.requirement_id IS NOT NULL AND (p_requirement IS NULL OR op.requirement_id = p_requirement)
  GROUP BY 1
), pl AS (
  SELECT j.requisition_id rid, count(*)::int n
  FROM public.ats_jobs j JOIN public.ats_applications a ON a.job_id = j.id
  WHERE j.requisition_id IS NOT NULL AND j.status IN ('open','paused') AND a.status IN ('active','on_hold')
    AND (p_requirement IS NULL OR j.requisition_id = p_requirement)
  GROUP BY 1
)
SELECT r.id,
  CASE WHEN r.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') THEN coalesce(pl.n, 0) ELSE 0 END,
  coalesce(ob.sel, 0), coalesce(ob.jn, 0), coalesce(ob.jd, 0)
FROM public.hr_hiring_requirements r
LEFT JOIN ob ON ob.rid = r.id
LEFT JOIN pl ON pl.rid = r.id
WHERE p_requirement IS NULL OR r.id = p_requirement
$$;

CREATE OR REPLACE FUNCTION public.hr_requirement_pipeline(p_requirement uuid DEFAULT NULL)
RETURNS TABLE(requirement_id uuid, applied integer, new_hc integer, screening integer, assessment integer, interview integer, offer integer, hired integer, joining integer, joined integer, still_needed integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH apps AS (
  SELECT j.requisition_id rid, a.status, st.code,
         (j.status IN ('open','paused') AND h.status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')) AS live
  FROM public.ats_jobs j JOIN public.ats_applications a ON a.job_id = j.id
  JOIN public.hr_hiring_requirements h ON h.id = j.requisition_id
  LEFT JOIN public.ats_stages st ON st.id = a.stage_id
  WHERE j.requisition_id IS NOT NULL AND (p_requirement IS NULL OR j.requisition_id = p_requirement)
), f AS (
  SELECT rid, count(*)::int applied,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'new')::int n,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'screening')::int sc,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'assessment')::int asm,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'interview')::int iv,
    count(*) FILTER (WHERE live AND status IN ('active','on_hold') AND code = 'offer')::int ofr
  FROM apps GROUP BY rid
)
SELECT h.id, coalesce(f.applied,0), coalesce(f.n,0), coalesce(f.sc,0), coalesce(f.asm,0), coalesce(f.iv,0), coalesce(f.ofr,0),
  coalesce(rp.selected_hc,0), coalesce(rp.joining_hc,0), h.positions_filled,
  greatest(h.number_required - h.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0)
FROM public.hr_hiring_requirements h
LEFT JOIN f ON f.rid = h.id
LEFT JOIN public.hr_wf_requirement_people(p_requirement) rp ON rp.requirement_id = h.id
WHERE p_requirement IS NULL OR h.id = p_requirement
$$;

CREATE OR REPLACE FUNCTION public.hr_wf_line_base()
RETURNS TABLE(plan_id uuid, department_id uuid, roles uuid[], groups uuid[], group_name text, group_start time without time zone, required_hc integer, current_hc integer, notice_hc integer, pipeline_hc integer, selected_hc integer, joining_hc integer, net_need integer, open_count integer, open_hc integer, committed_hc integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH lines AS (
  SELECT p.id, p.department_id, public.hr_wf_roles(p.position_id, p.eligible_position_ids) AS roles,
         public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) AS groups, p.required_hc
  FROM public.hr_headcount_plans p WHERE p.is_active
),
ppl AS (SELECT * FROM public.hr_wf_people() WHERE NOT is_training),
rp AS (SELECT * FROM public.hr_wf_requirement_people(NULL)),
ob AS (
  SELECT op.plan_id pid, count(*) FILTER (WHERE op.state = 'selected')::int sel, count(*) FILTER (WHERE op.state = 'joining')::int jn
  FROM public.hr_wf_onboarding_people() op WHERE op.plan_id IS NOT NULL GROUP BY 1
),
req AS (
  SELECT hr.staffing_plan_id AS pid,
    count(*) FILTER (WHERE hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled'))::int AS open_count,
    coalesce(sum(greatest(hr.number_required - hr.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0))
      FILTER (WHERE hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')),0)::int AS open_hc,
    coalesce(sum(greatest(hr.number_required - hr.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0))
      FILTER (WHERE hr.status IN ('approved','recruitment_active','partially_fulfilled')),0)::int AS committed_hc,
    coalesce(sum(rp.pipeline_hc),0)::int AS pipeline_hc
  FROM public.hr_hiring_requirements hr
  LEFT JOIN rp ON rp.requirement_id = hr.id
  WHERE hr.staffing_plan_id IS NOT NULL
  GROUP BY hr.staffing_plan_id
),
x AS (
  SELECT l.*,
    (SELECT count(*) FROM ppl e WHERE e.department_id IS NOT DISTINCT FROM l.department_id AND e.position_id = ANY(l.roles)
       AND (cardinality(l.groups) = 0 OR e.group_id = ANY(l.groups)))::int AS cur,
    (SELECT count(*) FROM ppl e WHERE e.department_id IS NOT DISTINCT FROM l.department_id AND e.position_id = ANY(l.roles)
       AND (cardinality(l.groups) = 0 OR e.group_id = ANY(l.groups)) AND e.resignation_status = 'notice_period')::int AS notice
  FROM lines l
)
SELECT x.id, x.department_id, x.roles, x.groups,
  CASE WHEN cardinality(x.groups) = 0 THEN 'Any shift'
       ELSE (SELECT string_agg(s.name, ' + ' ORDER BY s.start_time) FROM public.hr_shifts s WHERE s.id = ANY(x.groups)) END,
  (SELECT min(s.start_time) FROM public.hr_shifts s WHERE s.id = ANY(x.groups)),
  x.required_hc, x.cur, x.notice,
  coalesce(req.pipeline_hc,0), coalesce(ob.sel,0), coalesce(ob.jn,0),
  greatest(x.required_hc - x.cur - coalesce(ob.sel,0) - coalesce(ob.jn,0), 0),
  coalesce(req.open_count,0), coalesce(req.open_hc,0), coalesce(req.committed_hc,0)
FROM x LEFT JOIN req ON req.pid = x.id LEFT JOIN ob ON ob.pid = x.id
$$;

-- trainees: no-open-requirement shortages first, then largest shortage, then operating order (pre-06:00 shifts last)
CREATE OR REPLACE FUNCTION public.hr_wf_trainee_allocation()
RETURNS TABLE(out_employee_id uuid, out_plan_id uuid, out_ready_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base jsonb; v_alloc jsonb := '{}'::jsonb; t record; v_plan text; v_post uuid;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_base FROM public.hr_wf_line_base() b;
  FOR t IN
    SELECT p.employee_id, p.department_id, p.position_id, o.post_training_shift_id, o.training_completion_date
    FROM public.hr_wf_people() p
    LEFT JOIN LATERAL (
      SELECT ob.post_training_shift_id, ob.training_completion_date FROM public.hr_employee_onboarding ob
      WHERE ob.employee_id = p.employee_id AND ob.status <> 'cancelled'
      ORDER BY ob.created_at DESC LIMIT 1) o ON true
    WHERE p.is_training
    ORDER BY o.training_completion_date NULLS LAST, p.employee_id
  LOOP
    v_post := public.hr_wf_planning_shift(t.post_training_shift_id);
    SELECT b->>'plan_id' INTO v_plan
    FROM jsonb_array_elements(v_base) b
    CROSS JOIN LATERAL (SELECT (b->>'net_need')::int - coalesce((v_alloc->>(b->>'plan_id'))::int, 0) AS rem) r
    WHERE (b->>'department_id') IS NOT DISTINCT FROM t.department_id::text
      AND t.position_id::text IN (SELECT jsonb_array_elements_text(b->'roles'))
      AND ((v_post IS NOT NULL AND (jsonb_array_length(b->'groups') = 0 OR v_post::text IN (SELECT jsonb_array_elements_text(b->'groups'))))
        OR (v_post IS NULL AND r.rem > 0))
    ORDER BY (r.rem > 0 AND (b->>'open_count')::int = 0) DESC, r.rem DESC,
             ((b->>'group_start')::time < time '06:00') NULLS LAST, (b->>'group_start') NULLS LAST, b->>'plan_id'
    LIMIT 1;
    IF v_plan IS NOT NULL THEN
      v_alloc := jsonb_set(v_alloc, ARRAY[v_plan], to_jsonb(coalesce((v_alloc->>v_plan)::int, 0) + 1));
      out_employee_id := t.employee_id; out_plan_id := v_plan::uuid; out_ready_date := t.training_completion_date;
      RETURN NEXT;
    END IF;
    v_plan := NULL;
  END LOOP;
END $$;

-- ============ 4. Matrix with pause + operational desks ============
DROP FUNCTION IF EXISTS public.hr_workforce_staffing_matrix();
CREATE FUNCTION public.hr_workforce_staffing_matrix()
RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer, shift_group_name text, seat_capacity_id uuid, follow_desks boolean, in_training_hc integer, training_ready_date date, over_requested_hc integer,
  operational_capacity integer, seat_active boolean, auto_paused_at timestamptz, auto_paused_by_name text, auto_paused_reason text, auto_paused_need integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH b AS (SELECT * FROM public.hr_wf_line_base()),
tr AS (SELECT out_plan_id AS pid, count(*)::int AS n, min(out_ready_date) AS rd FROM public.hr_wf_trainee_allocation() GROUP BY 1),
rep AS (
  SELECT hr.staffing_plan_id AS pid, count(DISTINCT hr.replacement_employee_id)::int AS n
  FROM public.hr_hiring_requirements hr
  JOIN public.hr_employees e ON e.id = hr.replacement_employee_id AND e.is_active AND e.resignation_status = 'notice_period'
  WHERE hr.staffing_plan_id IS NOT NULL AND hr.status IN ('approved','recruitment_active','partially_fulfilled')
  GROUP BY 1
)
SELECT p.id, p.department_id, d.name, p.position_id,
  CASE WHEN cardinality(p.eligible_position_ids) > 1 THEN (
    SELECT string_agg(pos2.title, ' / ' ORDER BY array_position(p.eligible_position_ids, pos2.id))
    FROM public.positions pos2 WHERE pos2.id = ANY(p.eligible_position_ids)) ELSE pos.title END,
  p.shift_id, coalesce(s.name, p.shift_label), p.location, p.employment_type, p.approved_hc, p.required_hc,
  b.current_hc, coalesce(sc.physical_seats, 0), b.pipeline_hc, b.selected_hc, b.joining_hc, b.notice_hc,
  p.target_date, p.priority, b.open_count, b.open_hc,
  b.group_name, p.seat_capacity_id, p.follow_desks, coalesce(tr.n, 0), tr.rd,
  greatest(b.committed_hc - greatest(b.net_need - coalesce(tr.n, 0), 0) - least(b.notice_hc, coalesce(rep.n, 0)), 0),
  CASE WHEN sc.id IS NULL THEN NULL WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END,
  sc.is_active, p.auto_paused_at, p.auto_paused_by_name, p.auto_paused_reason, p.auto_paused_need
FROM public.hr_headcount_plans p
JOIN b ON b.plan_id = p.id
LEFT JOIN tr ON tr.pid = p.id
LEFT JOIN rep ON rep.pid = p.id
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.positions pos ON pos.id = p.position_id
LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
LEFT JOIN public.hr_seat_capacity sc ON sc.id = p.seat_capacity_id
WHERE p.is_active
$$;
REVOKE ALL ON FUNCTION public.hr_workforce_staffing_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_staffing_matrix() TO authenticated, service_role;

-- ============ 5. Reconcile with pause, refresh, run counter ============
CREATE OR REPLACE FUNCTION public.hr_reconcile_capacity_hiring(p_sync_plans boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; pl record; rq record; pa_id uuid; pa_out int; pa_target date; other_open int; v_net int; desired int; v_target date; v_notes text;
  v_priority text; v_prev text; v_skip boolean;
  plans_synced int := 0; created int := 0; updated int := 0; cancelled int := 0; paused int := 0; n int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));
  v_prev := coalesce(current_setting('hr.wf_reconciling', true), '');
  PERFORM set_config('hr.wf_reconciling', '1', true);
  PERFORM set_config('hr.wf_reconcile_runs', (coalesce(nullif(current_setting('hr.wf_reconcile_runs', true), ''), '0')::int + 1)::text, true);

  -- requirement progress (joined people activate in a separate request from onboarding completion)
  FOR rq IN SELECT id FROM public.hr_hiring_requirements WHERE status IN ('approved','recruitment_active','partially_fulfilled') LOOP
    PERFORM public.hr_wf_refresh_requirement(rq.id);
  END LOOP;

  UPDATE public.hr_headcount_plans p
     SET approved_hc = c.cap, required_hc = c.cap
    FROM (SELECT sc.id, CASE WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END AS cap
            FROM public.hr_seat_capacity sc) c
   WHERE p.seat_capacity_id = c.id AND p.follow_desks AND p.is_active
     AND (p.approved_hc IS DISTINCT FROM c.cap OR p.required_hc IS DISTINCT FROM c.cap);
  GET DIAGNOSTICS plans_synced = ROW_COUNT;

  UPDATE public.hr_hiring_requirements hr
     SET status = 'cancelled',
         notes = concat_ws(E'\n', nullif(hr.notes, ''), 'System-cancelled: its staffing line is no longer active.')
   WHERE hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval'
     AND NOT EXISTS (SELECT 1 FROM public.hr_headcount_plans p WHERE p.id = hr.staffing_plan_id AND p.is_active);
  GET DIAGNOSTICS n = ROW_COUNT; cancelled := cancelled + n;

  FOR m IN SELECT * FROM public.hr_workforce_staffing_matrix() LOOP
    pa_id := NULL; pa_out := 0; pa_target := NULL; v_skip := false;
    SELECT hr.id, greatest(hr.number_required - hr.positions_filled, 0), hr.target_joining_date
      INTO pa_id, pa_out, pa_target
      FROM public.hr_hiring_requirements hr
     WHERE hr.staffing_plan_id = m.plan_id AND hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval'
     LIMIT 1;
    v_net := greatest(m.required_hc - m.current_hc - m.selected_hc - m.pending_joining_hc - m.in_training_hc, 0);
    other_open := greatest(m.open_requirement_hc - coalesce(pa_out, 0), 0);
    desired := greatest(v_net - other_open, 0);
    v_target := coalesce(m.target_date, pa_target, v_today + 30);
    v_priority := CASE WHEN m.required_hc > 0 AND (desired::numeric / m.required_hc) >= 0.20 THEN 'critical' ELSE m.priority END;
    v_notes := format('100%% occupancy on %s · %s: %s required, %s on roll, %s selected, %s joining, %s in training, %s already on other open requirements — %s still to hire.',
      coalesce(m.position_title, 'role'), m.shift_group_name, m.required_hc, m.current_hc, m.selected_hc,
      m.pending_joining_hc, m.in_training_hc, other_open, desired);
    IF pa_id IS NOT NULL THEN
      IF desired = 0 THEN
        UPDATE public.hr_hiring_requirements
           SET status = 'cancelled', reason_notes = v_notes,
               notes = concat_ws(E'\n', nullif(notes, ''), 'System-cancelled: the live shortage is now covered.')
         WHERE id = pa_id;
        cancelled := cancelled + 1;
      ELSE
        UPDATE public.hr_hiring_requirements
           SET number_required = desired, department_id = m.department_id, position_id = m.position_id,
               shift_id = m.shift_id, shift_label = m.shift_name, location = m.location,
               employment_type = m.employment_type, target_joining_date = v_target, priority = v_priority,
               reason_notes = v_notes
         WHERE id = pa_id AND (number_required IS DISTINCT FROM desired OR department_id IS DISTINCT FROM m.department_id
            OR position_id IS DISTINCT FROM m.position_id OR shift_id IS DISTINCT FROM m.shift_id
            OR shift_label IS DISTINCT FROM m.shift_name OR location IS DISTINCT FROM m.location
            OR employment_type IS DISTINCT FROM m.employment_type OR target_joining_date IS DISTINCT FROM v_target
            OR priority IS DISTINCT FROM v_priority OR reason_notes IS DISTINCT FROM v_notes);
        IF FOUND THEN updated := updated + 1; END IF;
      END IF;
    ELSIF desired > 0 THEN
      IF m.auto_paused_at IS NOT NULL THEN
        SELECT * INTO pl FROM public.hr_headcount_plans WHERE id = m.plan_id;
        IF pl.auto_paused_signature IS NOT DISTINCT FROM public.hr_wf_line_signature(m.plan_id)
           AND desired <= coalesce(pl.auto_paused_need, 0) THEN
          v_skip := true; paused := paused + 1;
        ELSE
          UPDATE public.hr_headcount_plans SET auto_paused_at = NULL, auto_paused_by = NULL, auto_paused_by_name = NULL,
            auto_paused_reason = NULL, auto_paused_need = NULL, auto_paused_signature = NULL WHERE id = m.plan_id;
        END IF;
      END IF;
      IF NOT v_skip THEN
        INSERT INTO public.hr_hiring_requirements(requirement_no, staffing_plan_id, source, department_id, position_id, shift_id,
          shift_label, location, employment_type, number_required, target_joining_date, reason, reason_notes,
          requested_by_name, approver_name, priority, status, notes)
        VALUES (public.hr_next_hiring_requirement_no(), m.plan_id, 'capacity_occupancy', m.department_id, m.position_id, m.shift_id,
          m.shift_name, m.location, m.employment_type, desired, v_target, 'increased_workload', v_notes,
          'Workforce Planning System', 'HR Manager', v_priority, 'pending_approval',
          'System-generated for an uncovered staffing shortage on this line (100% desk occupancy policy).');
        created := created + 1;
      END IF;
    END IF;
  END LOOP;

  PERFORM set_config('hr.wf_reconciling', v_prev, true);
  RETURN jsonb_build_object('plans_synced', plans_synced, 'plans_created', 0, 'plans_updated', plans_synced,
    'requirements_created', created, 'requirements_updated', updated, 'requirements_cancelled', cancelled, 'lines_paused', paused);
END $$;

-- ============ 6. Exactly one reconcile per transaction, at commit ============
CREATE TABLE IF NOT EXISTS public.hr_wf_reconcile_queue (txid bigint PRIMARY KEY, queued_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.hr_wf_reconcile_queue TO service_role;
ALTER TABLE public.hr_wf_reconcile_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hr_wf_queue_reconcile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN RETURN; END IF;
  IF coalesce(current_setting('hr.wf_queued', true), '') = txid_current()::text THEN RETURN; END IF;
  INSERT INTO public.hr_wf_reconcile_queue(txid) VALUES (txid_current()) ON CONFLICT DO NOTHING;
  PERFORM set_config('hr.wf_queued', txid_current()::text, true);
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_mark_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb; n jsonb; c text;
BEGIN
  IF coalesce(current_setting('hr.wf_reconciling', true), '') = '1' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD); n := to_jsonb(NEW);
    FOREACH c IN ARRAY TG_ARGV LOOP
      IF (o -> c) IS DISTINCT FROM (n -> c) THEN PERFORM public.hr_wf_queue_reconcile(); RETURN NULL; END IF;
    END LOOP;
    RETURN NULL;
  END IF;
  PERFORM public.hr_wf_queue_reconcile();
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_run_queued_reconcile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.hr_wf_reconcile_queue WHERE txid = NEW.txid;
  PERFORM set_config('hr.wf_queued', '', true);
  PERFORM public.hr_reconcile_capacity_hiring(true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_hr_wf_reconcile_at_commit ON public.hr_wf_reconcile_queue;
CREATE CONSTRAINT TRIGGER trg_hr_wf_reconcile_at_commit AFTER INSERT ON public.hr_wf_reconcile_queue
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hr_wf_run_queued_reconcile();

DROP TRIGGER IF EXISTS trg_hr_ats_app_workforce_reconcile ON public.ats_applications;
DROP TRIGGER IF EXISTS trg_hr_ats_job_workforce_reconcile ON public.ats_jobs;
DROP TRIGGER IF EXISTS zz_trg_hr_candidate_workforce_reconcile ON public.hr_candidates;
DROP TRIGGER IF EXISTS trg_hr_onboarding_workforce_reconcile ON public.hr_employee_onboarding;
DROP TRIGGER IF EXISTS trg_hr_shift_schedule_reconcile ON public.hr_employee_shift_schedule;
DROP TRIGGER IF EXISTS trg_hr_work_info_reconcile ON public.hr_employee_work_info;
DROP TRIGGER IF EXISTS trg_hr_work_info_reconcile_update ON public.hr_employee_work_info;
DROP TRIGGER IF EXISTS trg_hr_employee_status_reconcile ON public.hr_employees;
DROP TRIGGER IF EXISTS trg_hr_headcount_plan_reconcile ON public.hr_headcount_plans;
DROP TRIGGER IF EXISTS trg_hr_requirement_workforce_reconcile ON public.hr_hiring_requirements;
DROP TRIGGER IF EXISTS trg_hr_seat_capacity_reconcile ON public.hr_seat_capacity;
DROP TRIGGER IF EXISTS trg_hr_shift_planning_reconcile ON public.hr_shifts;
DROP TRIGGER IF EXISTS trg_hr_position_planning_reconcile ON public.positions;

CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.ats_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('status','job_id');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.ats_jobs
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('requisition_id','status');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_candidates
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('recruitment_id','hired','canceled','converted','joining_date');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_employee_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('status','date_of_joining','ats_application_id','department_id','position_id','shift_id','post_training_shift_id','training_completion_date','employee_id');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_employee_shift_schedule
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('employee_id','shift_id','effective_from','effective_to','is_current');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_employee_work_info
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('employee_id','department_id','job_position_id','shift_id');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('is_active','resignation_status','last_working_day');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_headcount_plans
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('department_id','position_id','eligible_position_ids','shift_id','eligible_shift_ids','location','approved_hc','required_hc','is_active','seat_capacity_id','follow_desks','target_date');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('number_required','positions_filled','status','staffing_plan_id','source');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_seat_capacity
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('department_id','position_id','eligible_position_ids','shift_id','location','physical_seats','max_operational_capacity','is_active','is_training_only');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.hr_shifts
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('planning_shift_id','is_training_shift','is_active','start_time');
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR UPDATE OR DELETE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('in_workforce_planning','is_active');

-- progress triggers: no column lists (status set by BEFORE triggers must still fire them)
DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.ats_applications;
CREATE TRIGGER trg_hr_wf_progress AFTER UPDATE ON public.ats_applications FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.job_id IS DISTINCT FROM NEW.job_id)
  EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.ats_jobs;
CREATE TRIGGER trg_hr_wf_progress AFTER UPDATE ON public.ats_jobs FOR EACH ROW
  WHEN (OLD.requisition_id IS DISTINCT FROM NEW.requisition_id OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress_ins ON public.ats_jobs;
CREATE TRIGGER trg_hr_wf_progress_ins AFTER INSERT ON public.ats_jobs FOR EACH ROW EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.hr_employee_onboarding;
CREATE TRIGGER trg_hr_wf_progress AFTER UPDATE ON public.hr_employee_onboarding FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.ats_application_id IS DISTINCT FROM NEW.ats_application_id
     OR OLD.date_of_joining IS DISTINCT FROM NEW.date_of_joining OR OLD.employee_id IS DISTINCT FROM NEW.employee_id)
  EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress_ins ON public.hr_employee_onboarding;
CREATE TRIGGER trg_hr_wf_progress_ins AFTER INSERT ON public.hr_employee_onboarding FOR EACH ROW EXECUTE FUNCTION public.hr_wf_progress_trigger();
DROP TRIGGER IF EXISTS trg_hr_wf_progress ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_wf_progress AFTER UPDATE ON public.hr_hiring_requirements FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.hr_wf_progress_trigger();

-- ============ 7. Requirement ↔ line link ============
CREATE OR REPLACE FUNCTION public.hr_wf_link_requirement_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_grp uuid; v_ids uuid[]; l record;
BEGIN
  IF NEW.staffing_plan_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR NEW.staffing_plan_id IS DISTINCT FROM OLD.staffing_plan_id
       OR NEW.department_id IS DISTINCT FROM OLD.department_id OR NEW.position_id IS DISTINCT FROM OLD.position_id THEN
      SELECT p.* INTO l FROM public.hr_headcount_plans p WHERE p.id = NEW.staffing_plan_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'That staffing line does not exist'; END IF;
      IF l.department_id IS DISTINCT FROM NEW.department_id OR NOT (NEW.position_id = ANY(public.hr_wf_roles(l.position_id, l.eligible_position_ids))) THEN
        RAISE EXCEPTION 'The staffing line must be for the same department and role as the requirement';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.staffing_plan_id IS NOT NULL THEN RETURN NEW; END IF;   -- explicitly unlinked: respect it
  IF NEW.department_id IS NULL OR NEW.position_id IS NULL
     OR NEW.status NOT IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') THEN RETURN NEW; END IF;
  v_grp := public.hr_wf_planning_shift(NEW.shift_id);
  SELECT array_agg(p.id) INTO v_ids FROM public.hr_headcount_plans p
  WHERE p.is_active AND p.department_id = NEW.department_id
    AND NEW.position_id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))
    AND (v_grp IS NULL
         OR cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
         OR v_grp = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)));
  IF cardinality(v_ids) = 1 THEN
    NEW.staffing_plan_id := v_ids[1];
    IF NEW.shift_id IS NULL THEN
      SELECT coalesce(p.shift_id, p.eligible_shift_ids[1]) INTO NEW.shift_id FROM public.hr_headcount_plans p WHERE p.id = v_ids[1];
      NEW.shift_label := coalesce((SELECT name FROM public.hr_shifts WHERE id = NEW.shift_id), NEW.shift_label);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_link_requirement_line ON public.hr_hiring_requirements;
CREATE TRIGGER trg_hr_wf_link_requirement_line BEFORE INSERT OR UPDATE ON public.hr_hiring_requirements
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_link_requirement_line();

-- ============ 8. Transitions: decisions stick ============
CREATE OR REPLACE FUNCTION public.hr_requirement_transition(p_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_uid uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')), ''); v_name text; v_new text;
  v_line text; v_other text;
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_wf_is_manager(v_uid)) THEN
    RAISE EXCEPTION 'Only HRMS managers can change a hiring requirement''s status';
  END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hiring requirement not found'; END IF;
  PERFORM set_config('hr.wf_change_reason', coalesce(v_reason, ''), true);
  v_name := public.hr_wf_user_name(v_uid);

  CASE lower(coalesce(p_action,''))
    WHEN 'submit' THEN
      IF r.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be submitted (this one is %)', replace(r.status,'_',' '); END IF;
      IF r.source = 'capacity_occupancy' AND r.staffing_plan_id IS NOT NULL THEN
        SELECT requirement_no INTO v_other FROM public.hr_hiring_requirements
         WHERE staffing_plan_id = r.staffing_plan_id AND source = 'capacity_occupancy' AND status = 'pending_approval' AND id <> r.id LIMIT 1;
        IF v_other IS NOT NULL THEN
          RAISE EXCEPTION 'This line already has an automatic request awaiting approval (%). Approve, edit or cancel % instead of submitting this one.', v_other, v_other;
        END IF;
        UPDATE public.hr_headcount_plans SET auto_paused_at = NULL, auto_paused_by = NULL, auto_paused_by_name = NULL,
          auto_paused_reason = NULL, auto_paused_need = NULL, auto_paused_signature = NULL
         WHERE id = r.staffing_plan_id AND auto_paused_at IS NOT NULL;
      END IF;
      v_new := 'pending_approval';
      v_line := CASE WHEN v_reason IS NOT NULL THEN public.hr_wf_note_line('Submitted', v_uid, v_reason) END;
      UPDATE public.hr_hiring_requirements SET status = v_new, notes = concat_ws(E'\n', nullif(notes,''), v_line) WHERE id = p_id;
    WHEN 'approve' THEN
      IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only a requirement awaiting approval can be approved (this one is %)', replace(r.status,'_',' '); END IF;
      v_new := 'approved';
      v_line := CASE WHEN v_reason IS NOT NULL THEN public.hr_wf_note_line('Approved', v_uid, v_reason) END;
      UPDATE public.hr_hiring_requirements SET status = v_new, approver_id = v_uid,
        approver_name = CASE WHEN v_uid IS NULL THEN 'System' ELSE v_name END, approved_at = now(),
        rejection_reason = NULL, notes = concat_ws(E'\n', nullif(notes,''), v_line) WHERE id = p_id;
    WHEN 'reject' THEN
      IF r.status <> 'pending_approval' THEN RAISE EXCEPTION 'Only a requirement awaiting approval can be rejected (this one is %)', replace(r.status,'_',' '); END IF;
      IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for rejecting this requirement'; END IF;
      v_new := 'rejected';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = v_reason,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Rejected', v_uid, v_reason)) WHERE id = p_id;
    WHEN 'cancel' THEN
      IF r.status NOT IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled') THEN
        RAISE EXCEPTION 'Only an open requirement can be cancelled (this one is %)', replace(r.status,'_',' ');
      END IF;
      IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for cancelling this requirement'; END IF;
      v_new := 'cancelled';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Cancelled', v_uid, v_reason)) WHERE id = p_id;
    WHEN 'reopen' THEN
      IF r.status NOT IN ('rejected','cancelled') THEN RAISE EXCEPTION 'Only a rejected or cancelled requirement can be reopened (this one is %)', replace(r.status,'_',' '); END IF;
      v_new := 'draft';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL, approver_id = NULL,
        approver_name = NULL, approved_at = NULL,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Reopened', v_uid, coalesce(v_reason, 'back to draft'))) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'Unknown action "%" — use submit, approve, reject, cancel or reopen', coalesce(p_action,'');
  END CASE;

  -- a person declining a line's automatic request pauses automatic requests for that line
  IF v_new IN ('rejected','cancelled') AND v_uid IS NOT NULL AND r.source = 'capacity_occupancy' AND r.staffing_plan_id IS NOT NULL THEN
    UPDATE public.hr_headcount_plans
       SET auto_paused_at = now(), auto_paused_by = v_uid, auto_paused_by_name = v_name, auto_paused_reason = v_reason,
           auto_paused_need = greatest(r.number_required - r.positions_filled, 0),
           auto_paused_signature = public.hr_wf_line_signature(r.staffing_plan_id)
     WHERE id = r.staffing_plan_id;
  END IF;

  PERFORM set_config('hr.wf_change_reason', '', true);
  SELECT status INTO v_new FROM public.hr_hiring_requirements WHERE id = p_id;
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.hr_wf_resume_auto_hiring(p_plan uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_no text;
BEGIN
  IF NOT public.hr_wf_is_manager(v_uid) THEN RAISE EXCEPTION 'Only HRMS managers can restart automatic hiring for a line'; END IF;
  PERFORM set_config('hr.wf_change_reason', 'Raised again by ' || public.hr_wf_user_name(v_uid), true);
  UPDATE public.hr_headcount_plans SET auto_paused_at = NULL, auto_paused_by = NULL, auto_paused_by_name = NULL,
    auto_paused_reason = NULL, auto_paused_need = NULL, auto_paused_signature = NULL
   WHERE id = p_plan AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staffing line not found or not active'; END IF;
  PERFORM set_config('hr.wf_change_reason', '', true);
  PERFORM public.hr_reconcile_capacity_hiring(true);
  SELECT requirement_no INTO v_no FROM public.hr_hiring_requirements
   WHERE staffing_plan_id = p_plan AND source = 'capacity_occupancy' AND status = 'pending_approval' LIMIT 1;
  RETURN jsonb_build_object('requirement_no', v_no);
END $$;
REVOKE ALL ON FUNCTION public.hr_wf_resume_auto_hiring(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_resume_auto_hiring(uuid) TO authenticated, service_role;

-- ============ 9. Edit: system→manual on number edit; line moves for open requirements ============
CREATE OR REPLACE FUNCTION public.hr_update_requirement(p_id uuid, p_patch jsonb, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; l record; v_uid uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_full boolean; k text; v_line uuid; v_moving boolean; v_to_manual boolean;
  v_limited text[] := ARRAY['number_required','target_joining_date','salary_min','salary_max','required_skills','notes','staffing_plan_id'];
  v_all text[] := ARRAY['number_required','target_joining_date','salary_min','salary_max','required_skills','notes',
    'department_id','position_id','shift_id','shift_label','location','employment_type','reason','reason_notes',
    'experience_required','priority','staffing_plan_id','replacement_employee_id'];
BEGIN
  IF NOT public.hr_wf_is_manager(v_uid) THEN RAISE EXCEPTION 'Only HRMS managers can edit a hiring requirement'; END IF;
  SELECT * INTO r FROM public.hr_hiring_requirements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hiring requirement not found'; END IF;
  v_full := r.status IN ('draft','pending_approval');
  IF NOT v_full AND r.status NOT IN ('approved','recruitment_active','partially_fulfilled') THEN
    RAISE EXCEPTION 'A % requirement cannot be edited — reopen it first', replace(r.status,'_',' ');
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(CASE WHEN v_full THEN v_all ELSE v_limited END)) THEN
      RAISE EXCEPTION 'Field "%" cannot be changed once a requirement is approved', k;
    END IF;
  END LOOP;
  v_line := CASE WHEN p_patch ? 'staffing_plan_id' THEN nullif(p_patch->>'staffing_plan_id','')::uuid ELSE r.staffing_plan_id END;
  v_moving := v_line IS DISTINCT FROM r.staffing_plan_id;
  IF NOT v_full AND v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for changing an approved requirement'; END IF;
  IF v_moving AND v_reason IS NULL AND r.staffing_plan_id IS NOT NULL THEN RAISE EXCEPTION 'Give a reason for moving this requirement to another line'; END IF;
  IF NOT v_full AND v_moving AND v_line IS NULL THEN RAISE EXCEPTION 'An approved requirement can be moved to another line, not unlinked'; END IF;
  IF v_line IS NOT NULL AND v_moving THEN
    SELECT * INTO l FROM public.hr_headcount_plans WHERE id = v_line;
    IF NOT FOUND OR NOT l.is_active THEN RAISE EXCEPTION 'Pick an active staffing line'; END IF;
  END IF;
  v_to_manual := r.source = 'capacity_occupancy' AND v_full
    AND ((p_patch ? 'number_required' AND (p_patch->>'number_required')::int IS DISTINCT FROM r.number_required) OR v_moving);

  PERFORM set_config('hr.wf_change_reason', coalesce(v_reason, ''), true);
  UPDATE public.hr_hiring_requirements h SET
    number_required = CASE WHEN p_patch ? 'number_required' THEN (p_patch->>'number_required')::int ELSE h.number_required END,
    target_joining_date = CASE WHEN p_patch ? 'target_joining_date' THEN nullif(p_patch->>'target_joining_date','')::date ELSE h.target_joining_date END,
    salary_min = CASE WHEN p_patch ? 'salary_min' THEN nullif(p_patch->>'salary_min','')::numeric ELSE h.salary_min END,
    salary_max = CASE WHEN p_patch ? 'salary_max' THEN nullif(p_patch->>'salary_max','')::numeric ELSE h.salary_max END,
    required_skills = CASE WHEN p_patch ? 'required_skills' THEN p_patch->>'required_skills' ELSE h.required_skills END,
    notes = CASE WHEN p_patch ? 'notes' THEN p_patch->>'notes' ELSE h.notes END,
    department_id = CASE WHEN p_patch ? 'department_id' THEN nullif(p_patch->>'department_id','')::uuid ELSE h.department_id END,
    position_id = CASE WHEN p_patch ? 'position_id' THEN nullif(p_patch->>'position_id','')::uuid ELSE h.position_id END,
    shift_id = CASE WHEN v_moving AND v_line IS NOT NULL THEN coalesce(l.shift_id, l.eligible_shift_ids[1])
                    WHEN p_patch ? 'shift_id' THEN nullif(p_patch->>'shift_id','')::uuid ELSE h.shift_id END,
    shift_label = CASE WHEN v_moving AND v_line IS NOT NULL THEN coalesce((SELECT name FROM public.hr_shifts WHERE id = coalesce(l.shift_id, l.eligible_shift_ids[1])), l.shift_label)
                       WHEN p_patch ? 'shift_label' THEN p_patch->>'shift_label' ELSE h.shift_label END,
    location = CASE WHEN p_patch ? 'location' THEN p_patch->>'location' ELSE h.location END,
    employment_type = CASE WHEN p_patch ? 'employment_type' THEN p_patch->>'employment_type' ELSE h.employment_type END,
    reason = CASE WHEN p_patch ? 'reason' THEN p_patch->>'reason' ELSE h.reason END,
    reason_notes = CASE WHEN p_patch ? 'reason_notes' THEN p_patch->>'reason_notes' ELSE h.reason_notes END,
    experience_required = CASE WHEN p_patch ? 'experience_required' THEN p_patch->>'experience_required' ELSE h.experience_required END,
    priority = CASE WHEN p_patch ? 'priority' THEN p_patch->>'priority' ELSE h.priority END,
    staffing_plan_id = v_line,
    replacement_employee_id = CASE WHEN p_patch ? 'replacement_employee_id' THEN nullif(p_patch->>'replacement_employee_id','')::uuid ELSE h.replacement_employee_id END,
    source = CASE WHEN v_to_manual THEN 'manual' ELSE h.source END
  WHERE h.id = p_id;
  IF v_to_manual OR v_moving OR (NOT v_full AND v_reason IS NOT NULL) THEN
    UPDATE public.hr_hiring_requirements SET notes = concat_ws(E'\n', nullif(notes,''),
      public.hr_wf_note_line(CASE WHEN v_moving THEN 'Moved to another line' ELSE 'Edited' END, v_uid,
        concat_ws(' — ', v_reason, CASE WHEN v_to_manual THEN 'now a manual request (no longer resized automatically)' END)))
    WHERE id = p_id;
  END IF;
  PERFORM set_config('hr.wf_change_reason', '', true);
  PERFORM public.hr_wf_refresh_requirement(p_id);
END $$;

-- ============ 10. Positions: manager-only, lines follow ============
CREATE OR REPLACE FUNCTION public.hr_wf_position_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF OLD.in_workforce_planning IS DISTINCT FROM NEW.in_workforce_planning OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    IF NOT (public.hr_wf_caller_is_internal() OR public.hr_wf_is_manager(auth.uid())) THEN
      RAISE EXCEPTION 'Only HRMS managers can change whether a position is in workforce planning or tentative';
    END IF;
  END IF;
  IF OLD.is_active AND NOT NEW.is_active THEN
    SELECT count(*) INTO n FROM public.hr_employee_work_info w JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active
     WHERE w.job_position_id = NEW.id;
    IF n > 0 THEN
      RAISE EXCEPTION '% is held by % active employee(s). Move them to another role before marking it tentative.', NEW.title, n;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_position_guard ON public.positions;
CREATE TRIGGER trg_hr_wf_position_guard BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.hr_wf_position_guard();

CREATE OR REPLACE FUNCTION public.hr_wf_position_lines_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason text; l record; v_rest uuid[];
BEGIN
  IF OLD.in_workforce_planning AND NOT NEW.in_workforce_planning THEN v_reason := 'Position taken out of planning';
  ELSIF OLD.is_active AND NOT NEW.is_active THEN v_reason := 'Position marked tentative';
  ELSE RETURN NULL; END IF;
  PERFORM set_config('hr.wf_change_reason', v_reason, true);
  FOR l IN SELECT * FROM public.hr_headcount_plans p
            WHERE p.is_active AND NEW.id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids)) LOOP
    v_rest := array_remove(public.hr_wf_roles(l.position_id, l.eligible_position_ids), NEW.id);
    IF cardinality(v_rest) = 0 THEN
      UPDATE public.hr_headcount_plans SET is_active = false WHERE id = l.id;
      UPDATE public.hr_hiring_requirements
         SET status = 'cancelled', notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Cancelled', auth.uid(), v_reason))
       WHERE staffing_plan_id = l.id AND source = 'capacity_occupancy' AND status = 'pending_approval';
    ELSE
      UPDATE public.hr_headcount_plans
         SET position_id = CASE WHEN position_id = NEW.id OR position_id IS NULL THEN v_rest[1] ELSE position_id END,
             eligible_position_ids = CASE WHEN cardinality(v_rest) > 1 THEN v_rest ELSE '{}'::uuid[] END
       WHERE id = l.id;
    END IF;
  END LOOP;
  PERFORM set_config('hr.wf_change_reason', '', true);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_position_lines_follow ON public.positions;
CREATE TRIGGER trg_hr_wf_position_lines_follow AFTER UPDATE ON public.positions FOR EACH ROW
  WHEN (OLD.in_workforce_planning IS DISTINCT FROM NEW.in_workforce_planning OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.hr_wf_position_lines_follow();

-- ============ 11. Shift "Counts as" must not double-cover a role ============
CREATE OR REPLACE FUNCTION public.hr_wf_shift_group_overlap_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  WITH lines AS (
    SELECT p.id, p.department_id, public.hr_wf_roles(p.position_id, p.eligible_position_ids) roles,
           public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) groups,
           coalesce((SELECT string_agg(title, ' / ') FROM public.positions WHERE id = ANY(public.hr_wf_roles(p.position_id, p.eligible_position_ids))), 'role')
             || ' · ' || coalesce((SELECT string_agg(s.name, ' + ') FROM public.hr_shifts s WHERE s.id = ANY(array_prepend(p.shift_id, p.eligible_shift_ids))), 'Any shift') AS label
    FROM public.hr_headcount_plans p WHERE p.is_active)
  SELECT string_agg(a.label || ' and ' || b.label, '; ') AS pairs INTO c
  FROM lines a JOIN lines b ON a.id < b.id AND a.department_id IS NOT DISTINCT FROM b.department_id AND a.roles && b.roles
   AND (cardinality(a.groups) = 0 OR cardinality(b.groups) = 0 OR a.groups && b.groups);
  IF c.pairs IS NOT NULL THEN
    RAISE EXCEPTION 'This "Counts as" change would make two staffing lines cover the same shift: %. Remove or move one of those lines first.', c.pairs;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_hr_wf_shift_group_overlap_guard ON public.hr_shifts;
CREATE TRIGGER trg_hr_wf_shift_group_overlap_guard AFTER UPDATE ON public.hr_shifts FOR EACH ROW
  WHEN (OLD.planning_shift_id IS DISTINCT FROM NEW.planning_shift_id) EXECUTE FUNCTION public.hr_wf_shift_group_overlap_guard();

-- ============ 12. Replacement notes without personal details ============
CREATE OR REPLACE FUNCTION public.hr_raise_replacement_requirement(p_employee uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); e record; w record; v_id uuid; v_shift uuid; v_grp uuid; v_line uuid; v_date date; v_notes text;
BEGIN
  IF NOT public.hr_wf_is_manager(v_uid) THEN RAISE EXCEPTION 'Only HRMS managers can raise a replacement requirement'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('hr_replacement:' || p_employee::text));
  SELECT id INTO v_id FROM public.hr_hiring_requirements
   WHERE replacement_employee_id = p_employee AND source = 'employee_separation'
     AND status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled')
   ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO e FROM public.hr_employees WHERE id = p_employee;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO w FROM public.hr_employee_work_info WHERE employee_id = p_employee LIMIT 1;
  SELECT p.shift_id INTO v_shift FROM public.hr_wf_people() p WHERE p.employee_id = p_employee;
  v_shift := coalesce(v_shift, w.shift_id);
  v_grp := public.hr_wf_planning_shift(v_shift);
  SELECT b.plan_id INTO v_line FROM public.hr_wf_line_base() b
   WHERE b.department_id IS NOT DISTINCT FROM w.department_id AND w.job_position_id = ANY(b.roles)
     AND (cardinality(b.groups) = 0 OR v_grp = ANY(b.groups))
   ORDER BY cardinality(b.groups) DESC LIMIT 1;
  v_date := coalesce(e.last_working_day, e.notice_period_end_date);
  v_notes := format('Replacement for an employee leaving on %s', coalesce(to_char(v_date, 'DD Mon YYYY'), 'a date not yet set'));
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NOT NULL THEN v_notes := v_notes || '. ' || btrim(p_reason); END IF;
  INSERT INTO public.hr_hiring_requirements (requirement_no, department_id, position_id, shift_id, shift_label, employment_type,
    number_required, target_joining_date, reason, reason_notes, replacement_employee_id, requested_by, requested_by_name, requested_at,
    priority, status, staffing_plan_id, source)
  VALUES (public.hr_next_hiring_requirement_no(), w.department_id, w.job_position_id, v_shift,
    (SELECT name FROM public.hr_shifts WHERE id = v_shift), 'full_time', 1, v_date, 'replacement', v_notes, p_employee,
    v_uid, public.hr_wf_user_name(v_uid), now(), 'high', 'pending_approval', v_line, 'employee_separation')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============ 13. Leaving soon in planned roles ============
CREATE OR REPLACE FUNCTION public.hr_workforce_leaving_soon()
RETURNS TABLE(employee_id uuid, department_id uuid, position_id uuid, plan_id uuid, last_working_day date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.employee_id, p.department_id, p.position_id,
    (SELECT b.plan_id FROM public.hr_wf_line_base() b WHERE b.department_id IS NOT DISTINCT FROM p.department_id
       AND p.position_id = ANY(b.roles) AND (cardinality(b.groups) = 0 OR p.group_id = ANY(b.groups))
     ORDER BY cardinality(b.groups) DESC LIMIT 1),
    coalesce(e.last_working_day, e.notice_period_end_date)
  FROM public.hr_wf_people() p JOIN public.hr_employees e ON e.id = p.employee_id
  WHERE p.resignation_status = 'notice_period' AND p.position_id IS NOT NULL
    AND public.hr_wf_is_manager(auth.uid()) OR (p.resignation_status = 'notice_period' AND p.position_id IS NOT NULL AND public.hr_is_hr_staff(auth.uid()))
$$;

-- ============ grants for new helpers ============
REVOKE ALL ON FUNCTION public.hr_wf_onboarding_people() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_workforce_leaving_soon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_leaving_soon() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_wf_onboarding_people() TO service_role;
REVOKE ALL ON FUNCTION public.hr_wf_line_signature(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_wf_user_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_wf_queue_reconcile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_wf_mark_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_wf_run_queued_reconcile() FROM PUBLIC, anon, authenticated;
