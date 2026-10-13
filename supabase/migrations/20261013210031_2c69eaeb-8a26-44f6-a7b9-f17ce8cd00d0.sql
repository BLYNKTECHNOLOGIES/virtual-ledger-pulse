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
pp AS MATERIALIZED (SELECT * FROM public.hr_wf_people()),
ppl AS MATERIALIZED (SELECT p.department_id, p.position_id, p.group_id FROM pp p WHERE NOT p.is_training),
-- trainees already on the roll: with a post-training shift they hold that line's desk; without one they go first in the pool
te AS MATERIALIZED (
  SELECT p.department_id AS dept, p.position_id AS pos, coalesce(ps.planning_shift_id, ps.id) AS pgrp
  FROM pp p
  LEFT JOIN LATERAL (SELECT ob.post_training_shift_id FROM public.hr_employee_onboarding ob
                     WHERE ob.employee_id = p.employee_id AND ob.status <> 'cancelled' ORDER BY ob.created_at DESC LIMIT 1) x ON true
  LEFT JOIN public.hr_shifts ps ON ps.id = x.post_training_shift_id
  WHERE p.is_training
),
tq AS MATERIALIZED (
  SELECT st.id, st.dept, st.pos,
    row_number() OVER (PARTITION BY st.dept, st.pos ORDER BY st.created_at, st.id)
      + (SELECT count(*) FROM te WHERE te.dept IS NOT DISTINCT FROM st.dept AND te.pos = st.pos AND te.pgrp IS NULL) AS n
  FROM st
  WHERE st.rq_plan IS NULL AND st.state IN ('selected','joining') AND st.pos IS NOT NULL
    AND (st.grp IS NULL OR st.grp_training)
),
slots AS (
  SELECT d.dept, d.pos, l.id AS pid,
    row_number() OVER (PARTITION BY d.dept, d.pos
      ORDER BY (k <= r.rem) DESC, k, r.rem DESC, (l.gstart < time '06:00') NULLS LAST, l.gstart NULLS LAST, l.id) AS s
  FROM (SELECT tq.dept, tq.pos, max(tq.n) AS cnt FROM tq GROUP BY 1, 2) d
  JOIN lg l ON l.department_id IS NOT DISTINCT FROM d.dept AND d.pos = ANY(l.roles)
  CROSS JOIN LATERAL (SELECT l.required_hc
      - (SELECT count(*) FROM ppl e WHERE e.department_id IS NOT DISTINCT FROM l.department_id AND e.position_id = ANY(l.roles)
           AND (cardinality(l.groups) = 0 OR e.group_id = ANY(l.groups)))::int
      - (SELECT count(*) FROM te WHERE te.dept IS NOT DISTINCT FROM l.department_id AND te.pos = ANY(l.roles) AND te.pgrp IS NOT NULL
           AND (cardinality(l.groups) = 0 OR te.pgrp = ANY(l.groups)))::int AS rem) r
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