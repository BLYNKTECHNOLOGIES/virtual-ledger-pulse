CREATE OR REPLACE FUNCTION public.ats_save_interview_core(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
v_id uuid := nullif(p->>'id', '')::uuid;
v_app uuid := nullif(p->>'application_id', '')::uuid;
v_mode text := p->>'mode';
v_start timestamptz := nullif(p->>'starts_at', '')::timestamptz;
v_minutes integer := coalesce(nullif(p->>'duration_minutes', '')::integer, 30);
v_title text := coalesce(nullif(btrim(p->>'title'), ''), 'Interview');
v_loc text := nullif(btrim(coalesce(p->>'location', '')), '');
v_url text := nullif(btrim(coalesce(p->>'meeting_url', '')), '');
v_panel uuid[];
v_old public.ats_interviews;
v_new public.ats_interviews;
v_app_status text; v_cur_order integer; v_stage uuid; v_stage_order integer;
v_added uuid[] := '{}'; v_removed uuid[] := '{}'; v_row uuid; v_found integer;
v_stage_moved boolean := false;
c record;
BEGIN
IF auth.uid() IS NOT NULL AND NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
IF jsonb_typeof(coalesce(p->'panel', '[]'::jsonb)) <> 'array' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'panel';
END IF;
v_panel := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p->'panel', '[]'::jsonb)) AS t(x));
IF coalesce(array_length(v_panel, 1), 0) > 8 THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'panel'; END IF;
IF v_mode IS NULL OR v_mode NOT IN ('in_person', 'video', 'phone') THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'mode';
END IF;
IF v_start IS NULL THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'starts_at'; END IF;
IF v_minutes NOT BETWEEN 10 AND 480 THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'duration'; END IF;
IF v_start < now() - interval '30 days' OR v_start > now() + interval '365 days' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_TIME' USING HINT = 'Pick a time within the next year (or the last 30 days to record a past interview).';
END IF;
IF v_mode = 'in_person' THEN
v_loc := coalesce(v_loc, (SELECT interview_address FROM public.ats_settings WHERE id));
IF v_loc IS NULL THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'location'; END IF;
v_url := NULL;
ELSIF v_mode = 'video' THEN
IF v_url IS NULL OR v_url !~ '^https://[^\s<>"]+$' OR length(v_url) > 500 THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'meeting_url';
END IF;
v_loc := NULL;
ELSE
v_loc := NULL;
v_url := NULL;
END IF;

IF v_id IS NULL THEN
SELECT status INTO v_app_status FROM public.ats_applications WHERE id = v_app;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
IF v_app_status NOT IN ('active', 'on_hold') THEN
RAISE EXCEPTION 'ATS_APPLICATION_CLOSED' USING HINT = 'Reopen the application before scheduling an interview.';
END IF;
INSERT INTO public.ats_interviews (application_id, candidate_id, title, mode, starts_at, ends_at, location, meeting_url,
candidate_note, internal_note)
VALUES (v_app, NULL, v_title, v_mode, v_start, v_start + make_interval(mins => v_minutes), v_loc, v_url,
left(p->>'candidate_note', 1000), left(p->>'internal_note', 2000))
RETURNING * INTO v_new;
ELSE
SELECT * INTO v_old FROM public.ats_interviews WHERE id = v_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_INTERVIEW_NOT_FOUND'; END IF;
IF v_old.status <> 'scheduled' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED' USING HINT = 'Only a scheduled interview can be changed.';
END IF;
v_app := v_old.application_id;
SELECT status INTO v_app_status FROM public.ats_applications WHERE id = v_app;
UPDATE public.ats_interviews
SET title = v_title, mode = v_mode, starts_at = v_start, ends_at = v_start + make_interval(mins => v_minutes),
location = v_loc, meeting_url = v_url, candidate_note = left(p->>'candidate_note', 1000),
internal_note = left(p->>'internal_note', 2000)
WHERE id = v_id
RETURNING * INTO v_new;
END IF;

SELECT count(*) INTO v_found FROM unnest(v_panel) AS u(eid)
WHERE NOT EXISTS (SELECT 1 FROM public.ats_employee_contacts(ARRAY[u.eid]) ec WHERE ec.is_active)
AND NOT EXISTS (SELECT 1 FROM public.ats_interview_panel pm
WHERE pm.interview_id = v_new.id AND pm.employee_id = u.eid AND pm.removed_at IS NULL);
IF v_found > 0 THEN RAISE EXCEPTION 'ATS_INTERVIEWER_NOT_FOUND'; END IF;
FOR v_row IN
UPDATE public.ats_interview_panel SET removed_at = now()
WHERE interview_id = v_new.id AND removed_at IS NULL AND (employee_id IS NULL OR NOT (employee_id = ANY (v_panel)))
RETURNING id
LOOP
v_removed := v_removed || v_row;
END LOOP;
FOR c IN SELECT * FROM public.ats_employee_contacts(v_panel) LOOP
v_row := NULL;
INSERT INTO public.ats_interview_panel (interview_id, employee_id, user_id, name, email)
VALUES (v_new.id, c.employee_id, c.user_id, c.name, c.email)
ON CONFLICT (interview_id, employee_id) WHERE employee_id IS NOT NULL DO UPDATE
SET removed_at = NULL, user_id = EXCLUDED.user_id, name = EXCLUDED.name, email = EXCLUDED.email,
invite_status = NULL, invite_error = NULL, invited_revision = NULL, invited_at = NULL, cancel_sent_at = NULL
WHERE public.ats_interview_panel.removed_at IS NOT NULL
RETURNING id INTO v_row;
IF v_row IS NOT NULL THEN v_added := v_added || v_row; END IF;
END LOOP;

IF coalesce((p->>'move_to_interview_stage')::boolean, false) AND v_app_status IN ('active', 'on_hold') THEN
SELECT s.id, s.sort_order INTO v_stage, v_stage_order FROM public.ats_stages s
WHERE s.kind = 'interview' AND s.is_active ORDER BY s.sort_order LIMIT 1;
SELECT s.sort_order INTO v_cur_order FROM public.ats_applications a JOIN public.ats_stages s ON s.id = a.stage_id
WHERE a.id = v_app;
IF v_stage IS NOT NULL AND coalesce(v_cur_order, 0) < v_stage_order THEN
PERFORM public.ats_move_stage(v_app, v_stage, NULL);
v_stage_moved := true;
END IF;
END IF;

RETURN jsonb_build_object('id', v_new.id, 'application_id', v_new.application_id, 'candidate_id', v_new.candidate_id,
'revision', v_new.revision, 'status', v_new.status,
'time_changed', v_old.id IS NULL OR v_new.revision <> v_old.revision,
'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed), 'stage_moved', v_stage_moved);
END $function$;
REVOKE EXECUTE ON FUNCTION public.ats_save_interview_core(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_save_interview_core(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ats_save_interview(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
RETURN public.ats_save_interview_core(p);
END $function$;