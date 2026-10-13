-- 1. People: shift in effect today by its dates
CREATE OR REPLACE FUNCTION public.hr_wf_people()
 RETURNS TABLE(employee_id uuid, department_id uuid, position_id uuid, shift_id uuid, group_id uuid, is_training boolean, resignation_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH cs AS MATERIALIZED (
  SELECT DISTINCT ON (sch.employee_id) sch.employee_id, sch.shift_id
  FROM public.hr_employee_shift_schedule sch
  WHERE sch.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
    AND (sch.effective_to IS NULL OR sch.effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
  ORDER BY sch.employee_id, sch.effective_from DESC, sch.created_at DESC
)
SELECT e.id, w.department_id, w.job_position_id, coalesce(cs.shift_id, w.shift_id),
       coalesce(sh.planning_shift_id, sh.id),
       coalesce(sh.is_training_shift, false), e.resignation_status
FROM public.hr_employee_work_info w
JOIN public.hr_employees e ON e.id = w.employee_id AND e.is_active AND coalesce(e.resignation_status,'') <> 'completed'
LEFT JOIN public.positions pos ON pos.id = w.job_position_id
LEFT JOIN cs ON cs.employee_id = w.employee_id
LEFT JOIN public.hr_shifts sh ON sh.id = coalesce(cs.shift_id, w.shift_id)
WHERE pos.id IS NULL OR (pos.is_active AND pos.in_workforce_planning)
$function$;

-- 2. Onboarding people: trainees still in onboarding are allocated to a line once
CREATE OR REPLACE FUNCTION public.hr_wf_onboarding_people()
 RETURNS TABLE(onboarding_id uuid, requirement_id uuid, plan_id uuid, state text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH lines AS MATERIALIZED (
  SELECT p.id, p.department_id, p.required_hc,
         public.hr_wf_roles(p.position_id, p.eligible_position_ids) AS roles,
         public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) AS groups
  FROM public.hr_headcount_plans p WHERE p.is_active
),
lg AS MATERIALIZED (
  SELECT l.*, (SELECT min(s.start_time) FROM public.hr_shifts s WHERE s.id = ANY(l.groups)) AS gstart FROM lines l
),
o AS MATERIALIZED (
  SELECT o.id, o.created_at, o.status, o.date_of_joining, o.employee_id,
    coalesce(e.is_active, false) AS emp_active,
    (o.status = 'completed' AND o.employee_id IS NOT NULL AND NOT coalesce(e.is_active, false)
      AND coalesce(e.resignation_status, '') = '' AND e.last_working_day IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_daily d WHERE d.employee_id = o.employee_id)) AS awaiting_activation,
    o.hiring_requirement_id AS rid, rq.staffing_plan_id AS rq_plan,
    coalesce(o.department_id, rq.department_id) AS dept, coalesce(o.position_id, rq.position_id) AS pos,
    coalesce(gs.planning_shift_id, gs.id) AS grp,
    coalesce(gs.is_training_shift, false) OR coalesce(pg.is_training_shift, false) AS grp_training
  FROM public.hr_employee_onboarding o
  LEFT JOIN public.hr_employees e ON e.id = o.employee_id
  LEFT JOIN public.hr_hiring_requirements rq ON rq.id = o.hiring_requirement_id
  LEFT JOIN public.hr_shifts gs ON gs.id = coalesce(o.post_training_shift_id, o.shift_id, rq.shift_id)
  LEFT JOIN public.hr_shifts pg ON pg.id = gs.planning_shift_id
  WHERE o.status <> 'cancelled'
),
st AS MATERIALIZED (
  SELECT o.*,
    CASE
      WHEN o.emp_active THEN CASE WHEN o.status = 'completed' THEN 'joined' ELSE 'on_roll' END
      WHEN o.status = 'completed' THEN CASE WHEN o.awaiting_activation THEN 'joining'
                                            WHEN o.employee_id IS NOT NULL THEN 'joined' ELSE 'gone' END
      WHEN o.date_of_joining IS NOT NULL THEN 'joining'
      ELSE 'selected' END AS state
  FROM o
),
tq AS MATERIALIZED (
  SELECT st.id, st.dept, st.pos, row_number() OVER (PARTITION BY st.dept, st.pos ORDER BY st.created_at, st.id) AS n
  FROM st
  WHERE st.rq_plan IS NULL AND st.state IN ('selected','joining') AND st.pos IS NOT NULL
    AND (st.grp IS NULL OR st.grp_training)
),
ppl AS MATERIALIZED (SELECT p.department_id, p.position_id, p.group_id FROM public.hr_wf_people() p WHERE NOT p.is_training),
slots AS (
  SELECT d.dept, d.pos, l.id AS pid,
    row_number() OVER (PARTITION BY d.dept, d.pos
      ORDER BY (k <= r.rem) DESC, k, r.rem DESC, (l.gstart < time '06:00') NULLS LAST, l.gstart NULLS LAST, l.id) AS s
  FROM (SELECT DISTINCT tq.dept, tq.pos, count(*) OVER (PARTITION BY tq.dept, tq.pos) AS cnt FROM tq) d
  JOIN lg l ON l.department_id IS NOT DISTINCT FROM d.dept AND d.pos = ANY(l.roles)
  CROSS JOIN LATERAL (SELECT l.required_hc - (SELECT count(*) FROM ppl e
      WHERE e.department_id IS NOT DISTINCT FROM l.department_id AND e.position_id = ANY(l.roles)
        AND (cardinality(l.groups) = 0 OR e.group_id = ANY(l.groups)))::int AS rem) r
  CROSS JOIN LATERAL generate_series(1, greatest(r.rem, 0) + d.cnt::int) k
),
ta AS (
  SELECT tq.id, sl.pid FROM tq JOIN slots sl ON sl.dept IS NOT DISTINCT FROM tq.dept AND sl.pos = tq.pos AND sl.s = tq.n
)
SELECT st.id, st.rid,
  coalesce((SELECT l.id FROM lines l WHERE l.id = st.rq_plan),
           (SELECT ta.pid FROM ta WHERE ta.id = st.id),
           (SELECT l.id FROM lines l WHERE l.department_id IS NOT DISTINCT FROM st.dept AND st.pos = ANY(l.roles)
              AND (cardinality(l.groups) = 0 OR st.grp = ANY(l.groups))
            ORDER BY cardinality(l.groups) DESC, l.id LIMIT 1)),
  st.state
FROM st
$function$;

-- 3. Line base: compute each part once
CREATE OR REPLACE FUNCTION public.hr_wf_line_base()
 RETURNS TABLE(plan_id uuid, department_id uuid, roles uuid[], groups uuid[], group_name text, group_start time without time zone, required_hc integer, current_hc integer, notice_hc integer, pipeline_hc integer, selected_hc integer, joining_hc integer, net_need integer, open_count integer, open_hc integer, committed_hc integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH lines AS MATERIALIZED (
  SELECT p.id, p.department_id, public.hr_wf_roles(p.position_id, p.eligible_position_ids) AS roles,
         public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) AS groups, p.required_hc
  FROM public.hr_headcount_plans p WHERE p.is_active
),
ppl AS MATERIALIZED (SELECT * FROM public.hr_wf_people() WHERE NOT is_training),
rp AS MATERIALIZED (SELECT * FROM public.hr_wf_requirement_people(NULL)),
ob AS MATERIALIZED (
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
$function$;

-- 4. Trainee allocation from a precomputed line base
CREATE OR REPLACE FUNCTION public.hr_wf_trainee_allocation_from(p_base jsonb)
 RETURNS TABLE(out_employee_id uuid, out_plan_id uuid, out_ready_date date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_alloc jsonb := '{}'::jsonb; t record; v_plan text; v_post uuid;
BEGIN
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
    FROM jsonb_array_elements(coalesce(p_base, '[]'::jsonb)) b
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
END $function$;
REVOKE ALL ON FUNCTION public.hr_wf_trainee_allocation_from(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hr_wf_trainee_allocation()
 RETURNS TABLE(out_employee_id uuid, out_plan_id uuid, out_ready_date date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT * FROM public.hr_wf_trainee_allocation_from((SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM public.hr_wf_line_base() b))
$function$;
REVOKE ALL ON FUNCTION public.hr_wf_trainee_allocation() FROM PUBLIC, anon, authenticated;

-- 5. Matrix core: one line base per call
CREATE OR REPLACE FUNCTION public.hr_wf_staffing_matrix_core()
 RETURNS TABLE(plan_id uuid, department_id uuid, department_name text, position_id uuid, position_title text, shift_id uuid, shift_name text, location text, employment_type text, approved_hc integer, required_hc integer, current_hc integer, physical_seats integer, pipeline_hc integer, selected_hc integer, pending_joining_hc integer, notice_period_hc integer, target_date date, priority text, open_requirement_count integer, open_requirement_hc integer, shift_group_name text, seat_capacity_id uuid, follow_desks boolean, in_training_hc integer, training_ready_date date, over_requested_hc integer, operational_capacity integer, seat_active boolean, auto_paused_at timestamp with time zone, auto_paused_by_name text, auto_paused_reason text, auto_paused_need integer, replacement_cover_hc integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH b AS MATERIALIZED (SELECT * FROM public.hr_wf_line_base()),
tr AS (SELECT out_plan_id AS pid, count(*)::int AS n, min(out_ready_date) AS rd
       FROM public.hr_wf_trainee_allocation_from((SELECT coalesce(jsonb_agg(to_jsonb(bb)), '[]'::jsonb) FROM b bb)) GROUP BY 1),
rep AS (
  SELECT hr.staffing_plan_id AS pid, count(DISTINCT hr.replacement_employee_id)::int AS n
  FROM public.hr_hiring_requirements hr
  JOIN public.hr_employees e ON e.id = hr.replacement_employee_id AND e.is_active AND e.resignation_status = 'notice_period'
  WHERE hr.staffing_plan_id IS NOT NULL AND hr.status IN ('approved','recruitment_active','partially_fulfilled')
  GROUP BY 1
),
rc AS (
  SELECT hr.staffing_plan_id AS pid,
    sum(greatest(hr.number_required - hr.positions_filled - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0))::int AS n
  FROM public.hr_hiring_requirements hr
  JOIN public.hr_employees e ON e.id = hr.replacement_employee_id AND e.is_active AND e.resignation_status = 'notice_period'
  LEFT JOIN LATERAL public.hr_wf_requirement_people(hr.id) rp ON true
  WHERE hr.staffing_plan_id IS NOT NULL AND hr.status IN ('pending_approval','approved','recruitment_active','partially_fulfilled')
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
  sc.is_active, p.auto_paused_at, p.auto_paused_by_name, p.auto_paused_reason, p.auto_paused_need,
  least(b.notice_hc, coalesce(rc.n, 0))
FROM public.hr_headcount_plans p
JOIN b ON b.plan_id = p.id
LEFT JOIN tr ON tr.pid = p.id
LEFT JOIN rep ON rep.pid = p.id
LEFT JOIN rc ON rc.pid = p.id
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.positions pos ON pos.id = p.position_id
LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
LEFT JOIN public.hr_seat_capacity sc ON sc.id = p.seat_capacity_id
WHERE p.is_active
$function$;

-- 6. Set-based requirement refresh that never waits on another user's row locks
CREATE OR REPLACE FUNCTION public.hr_wf_refresh_open_requirements()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  WITH c AS (
    SELECT r.id FROM public.hr_hiring_requirements r
    WHERE r.status IN ('approved','recruitment_active','partially_fulfilled')
    FOR UPDATE SKIP LOCKED
  ), rp AS MATERIALIZED (SELECT * FROM public.hr_wf_requirement_people(NULL))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'no', r.requirement_no, 'filled', coalesce(rp.joined_hc, 0),
      'lft', greatest(r.number_required - coalesce(rp.joined_hc,0) - coalesce(rp.selected_hc,0) - coalesce(rp.joining_hc,0), 0),
      'status', CASE WHEN coalesce(rp.joined_hc,0) >= r.number_required THEN 'fulfilled'
                     WHEN coalesce(rp.joined_hc,0) > 0 THEN 'partially_fulfilled'
                     WHEN EXISTS (SELECT 1 FROM public.ats_jobs aj WHERE aj.requisition_id = r.id AND aj.status IN ('open','paused')) THEN 'recruitment_active'
                     WHEN r.status = 'partially_fulfilled' THEN 'approved'
                     ELSE r.status END)), '[]'::jsonb)
    INTO v
  FROM c JOIN public.hr_hiring_requirements r ON r.id = c.id LEFT JOIN rp ON rp.requirement_id = r.id;

  UPDATE public.hr_hiring_requirements h SET positions_filled = x.filled, status = x.status
    FROM jsonb_to_recordset(v) AS x(id uuid, filled int, status text)
   WHERE h.id = x.id AND (h.positions_filled IS DISTINCT FROM x.filled OR h.status IS DISTINCT FROM x.status);

  UPDATE public.ats_jobs t SET status = 'closed', closed_reason = 'Hiring requirement fulfilled'
   WHERE t.id IN (SELECT j.id FROM public.ats_jobs j
                   WHERE j.status IN ('open','paused')
                     AND j.requisition_id IN (SELECT x.id FROM jsonb_to_recordset(v) AS x(id uuid, status text) WHERE x.status = 'fulfilled')
                   FOR UPDATE SKIP LOCKED);

  WITH j AS (
    SELECT aj.id, aj.openings AS old_o, greatest(x.lft, 1) AS new_o, x.lft, x.no, x.id AS rid
    FROM public.ats_jobs aj JOIN jsonb_to_recordset(v) AS x(id uuid, no text, lft int, status text) ON x.id = aj.requisition_id
    WHERE x.status <> 'fulfilled' AND aj.status IN ('open','paused') AND aj.openings IS DISTINCT FROM greatest(x.lft, 1)
    FOR UPDATE OF aj SKIP LOCKED
  ), u AS (UPDATE public.ats_jobs t SET openings = j.new_o FROM j WHERE t.id = j.id RETURNING t.id)
  INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
  SELECT j.id, 'job_openings', format('Openings %s → %s to match %s (%s still to find)', j.old_o, j.new_o, j.no, j.lft),
         jsonb_build_object('requirement_id', j.rid, 'from', j.old_o, 'to', j.new_o, 'still_to_find', j.lft), 'System'
  FROM j JOIN u ON u.id = j.id;
END $function$;
REVOKE ALL ON FUNCTION public.hr_wf_refresh_open_requirements() FROM PUBLIC, anon, authenticated;

-- 7. Reconcile: set-based refresh, skip locked rows, shrinking pauses
CREATE OR REPLACE FUNCTION public.hr_reconcile_capacity_hiring(p_sync_plans boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m record; pl record; pa_id uuid; pa_out int; pa_target date; other_open int; v_net int; desired int; v_target date; v_notes text;
  v_priority text; v_prev text; v_paused int; v_auto int;
  plans_synced int := 0; created int := 0; updated int := 0; cancelled int := 0; paused int := 0; skipped int := 0; n int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));
  v_prev := coalesce(current_setting('hr.wf_reconciling', true), '');
  PERFORM set_config('hr.wf_reconciling', '1', true);
  PERFORM set_config('hr.wf_reconcile_runs', (coalesce(nullif(current_setting('hr.wf_reconcile_runs', true), ''), '0')::int + 1)::text, true);

  PERFORM public.hr_wf_refresh_open_requirements();

  UPDATE public.hr_headcount_plans p
     SET approved_hc = c.cap, required_hc = c.cap
    FROM (SELECT sc.id, CASE WHEN sc.is_active THEN coalesce(sc.max_operational_capacity, sc.physical_seats) ELSE 0 END AS cap
            FROM public.hr_seat_capacity sc) c
   WHERE p.seat_capacity_id = c.id AND p.follow_desks AND p.is_active
     AND (p.approved_hc IS DISTINCT FROM c.cap OR p.required_hc IS DISTINCT FROM c.cap)
     AND p.id IN (SELECT q.id FROM public.hr_headcount_plans q WHERE q.follow_desks AND q.is_active FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS plans_synced = ROW_COUNT;

  UPDATE public.hr_hiring_requirements hr
     SET status = 'cancelled',
         notes = concat_ws(E'\n', nullif(hr.notes, ''), 'System-cancelled: its staffing line is no longer active.')
   WHERE hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval'
     AND NOT EXISTS (SELECT 1 FROM public.hr_headcount_plans p WHERE p.id = hr.staffing_plan_id AND p.is_active)
     AND hr.id IN (SELECT q.id FROM public.hr_hiring_requirements q WHERE q.source = 'capacity_occupancy' AND q.status = 'pending_approval' FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS n = ROW_COUNT; cancelled := cancelled + n;

  FOR m IN SELECT * FROM public.hr_wf_staffing_matrix_core() LOOP
    pa_id := NULL; pa_out := 0; pa_target := NULL; v_paused := 0;
    -- Never wait on a row another transaction holds; the next run picks the line up.
    PERFORM 1 FROM public.hr_headcount_plans WHERE id = m.plan_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN skipped := skipped + 1; CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.hr_hiring_requirements hr WHERE hr.staffing_plan_id = m.plan_id
                 AND hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval') THEN
      SELECT hr.id, greatest(hr.number_required - hr.positions_filled, 0), hr.target_joining_date
        INTO pa_id, pa_out, pa_target
        FROM public.hr_hiring_requirements hr
       WHERE hr.staffing_plan_id = m.plan_id AND hr.source = 'capacity_occupancy' AND hr.status = 'pending_approval'
       LIMIT 1 FOR UPDATE SKIP LOCKED;
      IF pa_id IS NULL THEN skipped := skipped + 1; CONTINUE; END IF;
    END IF;
    v_net := greatest(m.required_hc - m.current_hc - m.selected_hc - m.pending_joining_hc - m.in_training_hc, 0);
    other_open := greatest(m.open_requirement_hc - coalesce(pa_out, 0) - coalesce(m.replacement_cover_hc, 0), 0);
    desired := greatest(v_net - other_open, 0);
    IF m.auto_paused_at IS NOT NULL THEN
      SELECT * INTO pl FROM public.hr_headcount_plans WHERE id = m.plan_id;
      IF pl.auto_paused_signature IS NOT DISTINCT FROM public.hr_wf_line_signature(m.plan_id) THEN
        v_paused := coalesce(pl.auto_paused_need, 0);
        -- A pause can only hold back shortage that still exists.
        IF desired < v_paused THEN
          IF desired = 0 THEN
            UPDATE public.hr_headcount_plans SET auto_paused_at = NULL, auto_paused_by = NULL, auto_paused_by_name = NULL,
              auto_paused_reason = NULL, auto_paused_need = NULL, auto_paused_signature = NULL WHERE id = m.plan_id;
          ELSE
            UPDATE public.hr_headcount_plans SET auto_paused_need = desired WHERE id = m.plan_id;
          END IF;
          v_paused := desired;
        END IF;
      ELSE
        UPDATE public.hr_headcount_plans SET auto_paused_at = NULL, auto_paused_by = NULL, auto_paused_by_name = NULL,
          auto_paused_reason = NULL, auto_paused_need = NULL, auto_paused_signature = NULL WHERE id = m.plan_id;
      END IF;
    END IF;
    v_auto := greatest(desired - v_paused, 0);
    IF v_paused > 0 AND desired > 0 AND v_auto < desired THEN paused := paused + 1; END IF;
    v_target := coalesce(m.target_date, pa_target, v_today + 30);
    v_priority := CASE WHEN m.required_hc > 0 AND v_net::numeric / m.required_hc >= 0.5 THEN 'critical'
                       WHEN m.required_hc > 0 AND v_net::numeric / m.required_hc >= 0.2 THEN 'high'
                       ELSE 'medium' END;
    v_notes := format('100%% occupancy on %s · %s: %s required, %s on roll, %s selected, %s joining, %s in training, %s already on other open requirements%s — %s still to hire%s.',
      coalesce(m.position_title, 'role'), m.shift_group_name, m.required_hc, m.current_hc, m.selected_hc,
      m.pending_joining_hc, m.in_training_hc, other_open,
      CASE WHEN coalesce(m.replacement_cover_hc,0) > 0 THEN format(' (%s more held for people still on notice)', m.replacement_cover_hc) ELSE '' END,
      v_auto,
      CASE WHEN v_paused > 0 THEN format('; %s declined by HR and paused', least(v_paused, desired)) ELSE '' END);
    IF pa_id IS NOT NULL THEN
      IF v_auto = 0 THEN
        UPDATE public.hr_hiring_requirements
           SET status = 'cancelled', reason_notes = v_notes,
               notes = concat_ws(E'\n', nullif(notes, ''), CASE WHEN desired > 0
                 THEN 'System-cancelled: the rest of this line''s shortage was declined by HR and is paused.'
                 ELSE 'System-cancelled: the live shortage is now covered.' END)
         WHERE id = pa_id;
        cancelled := cancelled + 1;
      ELSE
        UPDATE public.hr_hiring_requirements
           SET number_required = v_auto, reason_notes = v_notes
         WHERE id = pa_id AND (number_required IS DISTINCT FROM v_auto OR reason_notes IS DISTINCT FROM v_notes);
        IF FOUND THEN updated := updated + 1; END IF;
      END IF;
    ELSIF v_auto > 0 THEN
      INSERT INTO public.hr_hiring_requirements(requirement_no, staffing_plan_id, source, department_id, position_id, shift_id,
        shift_label, location, employment_type, number_required, target_joining_date, reason, reason_notes,
        requested_by_name, approver_name, priority, status, notes)
      VALUES (public.hr_next_hiring_requirement_no(), m.plan_id, 'capacity_occupancy', m.department_id, m.position_id, m.shift_id,
        m.shift_name, m.location, m.employment_type, v_auto, v_target, 'increased_workload', v_notes,
        'Workforce Planning System', NULL, v_priority, 'pending_approval',
        'System-generated for an uncovered staffing shortage on this line (100% desk occupancy policy).');
      created := created + 1;
    END IF;
  END LOOP;

  PERFORM set_config('hr.wf_reconciling', v_prev, true);
  RETURN jsonb_build_object('plans_synced', plans_synced, 'plans_created', 0, 'plans_updated', plans_synced,
    'requirements_created', created, 'requirements_updated', updated, 'requirements_cancelled', cancelled,
    'lines_paused', paused, 'lines_skipped_locked', skipped);
END $function$;

-- 8. Daily reconcile (scheduled after the LWD sweep)
CREATE OR REPLACE FUNCTION public.hr_wf_daily_reconcile()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.hr_reconcile_capacity_hiring(true);
END $function$;
REVOKE ALL ON FUNCTION public.hr_wf_daily_reconcile() FROM PUBLIC, anon, authenticated;

-- 9. Reconcile marks only on columns that feed it (hires count through onboarding; job status/link refresh via progress triggers)
DROP TRIGGER IF EXISTS zz_hr_wf_mark ON public.ats_applications;
DROP TRIGGER IF EXISTS zz_hr_wf_mark ON public.ats_jobs;
DROP TRIGGER IF EXISTS zz_hr_wf_mark ON public.hr_candidates;
DROP TRIGGER IF EXISTS zz_hr_wf_mark ON public.hr_employees;
CREATE TRIGGER zz_hr_wf_mark AFTER INSERT OR DELETE OR UPDATE ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_mark_change('is_active', 'resignation_status');

-- 10. Serialise the line-overlap check
CREATE OR REPLACE FUNCTION public.hr_wf_validate_line_overlap()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; c record; v_roles uuid[]; v_groups uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hr_wf_line_overlap'));
  SELECT * INTO r FROM public.hr_headcount_plans WHERE id = NEW.id;
  IF NOT FOUND OR NOT r.is_active THEN RETURN NULL; END IF;
  v_roles := public.hr_wf_roles(r.position_id, r.eligible_position_ids);
  v_groups := public.hr_wf_shift_groups(r.shift_id, r.eligible_shift_ids);
  SELECT p.id, pos.title,
         coalesce((SELECT string_agg(s.name, ' + ') FROM public.hr_shifts s
                    WHERE s.id = ANY(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids))), 'any shift') AS shifts
    INTO c
    FROM public.hr_headcount_plans p
    LEFT JOIN public.positions pos ON pos.id = p.position_id
   WHERE p.is_active AND p.id <> r.id
     AND p.department_id IS NOT DISTINCT FROM r.department_id
     AND public.hr_wf_roles(p.position_id, p.eligible_position_ids) && v_roles
     AND (cardinality(v_groups) = 0
          OR cardinality(public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids)) = 0
          OR public.hr_wf_shift_groups(p.shift_id, p.eligible_shift_ids) && v_groups)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'This staffing line overlaps an existing active line (% · %). A role can have one line per shift, or a single "any shift" line — not both.',
      coalesce(c.title, 'role'), c.shifts;
  END IF;
  RETURN NULL;
END $function$;

-- 11. One open department-head request per line
CREATE UNIQUE INDEX IF NOT EXISTS hr_hiring_req_one_open_dept_request
  ON public.hr_hiring_requirements (staffing_plan_id)
  WHERE source = 'department_request' AND staffing_plan_id IS NOT NULL
    AND status IN ('draft','pending_approval','approved','recruitment_active','partially_fulfilled');

-- 12. Department head guard only when the head changes
CREATE OR REPLACE FUNCTION public.hr_department_head_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.head_employee_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.head_employee_id ELSE NULL END) THEN
    IF auth.uid() IS NOT NULL AND NOT public.hr_wf_is_manager(auth.uid()) THEN
      RAISE EXCEPTION 'Only HRMS managers can set the head of a department';
    END IF;
    IF NEW.head_employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = NEW.head_employee_id AND e.is_active) THEN
      RAISE EXCEPTION 'The head of department must be an active employee';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 13. Desk groups cannot be removed while lines follow them
CREATE OR REPLACE FUNCTION public.hr_wf_seat_removal_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v text; v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.is_active AND NOT NEW.is_active) THEN RETURN NEW; END IF;
  SELECT string_agg(concat_ws(' · ', coalesce(pos.title, 'role'), coalesce(s.name, p.shift_label, 'any shift')), '; ' ORDER BY pos.title)
    INTO v
    FROM public.hr_headcount_plans p
    LEFT JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.hr_shifts s ON s.id = p.shift_id
   WHERE p.is_active AND p.follow_desks AND p.seat_capacity_id = v_id;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'These staffing lines still follow this desk group: %. Switch them to fixed numbers or move them to another desk group first.', v
      USING HINT = 'HR_WF_DESK_GROUP_IN_USE';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;
REVOKE ALL ON FUNCTION public.hr_wf_seat_removal_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a1_hr_wf_seat_removal_guard ON public.hr_seat_capacity;
CREATE TRIGGER a1_hr_wf_seat_removal_guard BEFORE UPDATE OR DELETE ON public.hr_seat_capacity
  FOR EACH ROW EXECUTE FUNCTION public.hr_wf_seat_removal_guard();

CREATE OR REPLACE FUNCTION public.hr_wf_remove_desk_group(p_seat uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.hr_wf_is_manager(auth.uid()) THEN RAISE EXCEPTION 'Only HRMS managers can remove a desk group'; END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Give a reason for removing this desk group'; END IF;
  UPDATE public.hr_seat_capacity
     SET is_active = false, notes = concat_ws(E'\n', nullif(notes, ''), 'Removed: ' || btrim(p_reason))
   WHERE id = p_seat AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That desk group is no longer active'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.hr_wf_remove_desk_group(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_wf_remove_desk_group(uuid, text) TO authenticated;

-- 14. Overdue joiners (HR staff)
CREATE OR REPLACE FUNCTION public.hr_workforce_overdue_joiners()
 RETURNS TABLE(onboarding_id uuid, full_name text, department_name text, position_title text, plan_id uuid, date_of_joining date, onboarding_status text, days_overdue integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT (public.hr_wf_caller_is_internal() OR public.hr_is_hr_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Only HR staff can see overdue joiners';
  END IF;
  RETURN QUERY
  SELECT o.id, nullif(btrim(concat_ws(' ', o.first_name, o.last_name)), ''), d.name, pos.title, op.plan_id,
         o.date_of_joining, o.status, (v_today - o.date_of_joining)::int
  FROM public.hr_wf_onboarding_people() op
  JOIN public.hr_employee_onboarding o ON o.id = op.onboarding_id
  LEFT JOIN public.departments d ON d.id = o.department_id
  LEFT JOIN public.positions pos ON pos.id = o.position_id
  WHERE op.state = 'joining' AND o.date_of_joining IS NOT NULL AND o.date_of_joining < v_today - 3
  ORDER BY o.date_of_joining;
END $function$;
REVOKE ALL ON FUNCTION public.hr_workforce_overdue_joiners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_overdue_joiners() TO authenticated;