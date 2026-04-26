-- Seed Appeal permissions for existing terminal roles with least-privilege defaults.
INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT r.id, p.permission::public.terminal_permission
FROM public.p2p_terminal_roles r
CROSS JOIN (VALUES
  ('terminal_appeals_view'),
  ('terminal_appeals_manage'),
  ('terminal_appeals_request'),
  ('terminal_appeals_toggle')
) AS p(permission)
WHERE lower(r.name) IN ('super admin', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT r.id, p.permission::public.terminal_permission
FROM public.p2p_terminal_roles r
CROSS JOIN (VALUES
  ('terminal_appeals_view'),
  ('terminal_appeals_manage'),
  ('terminal_appeals_request')
) AS p(permission)
WHERE lower(r.name) IN ('coo', 'operations manager', 'operation manager', 'assistant manager', 'asst manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.p2p_terminal_role_permissions (role_id, permission)
SELECT r.id, p.permission::public.terminal_permission
FROM public.p2p_terminal_roles r
CROSS JOIN (VALUES
  ('terminal_appeals_view'),
  ('terminal_appeals_request')
) AS p(permission)
WHERE lower(r.name) IN ('small payments manager', 'small payment manager')
ON CONFLICT DO NOTHING;

DELETE FROM public.p2p_terminal_role_permissions rp
USING public.p2p_terminal_roles r
WHERE rp.role_id = r.id
  AND rp.permission = 'terminal_appeals_toggle'::public.terminal_permission
  AND lower(r.name) NOT IN ('super admin', 'admin');

CREATE OR REPLACE FUNCTION public.set_terminal_appeal_response_timer(p_case_id uuid, p_minutes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous jsonb;
  v_due_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
    RAISE EXCEPTION 'Not authorized to manage appeal timer';
  END IF;
  IF p_minutes IS NOT NULL AND p_minutes NOT IN (10, 30, 60, 120, 240, 480, 1440) THEN
    RAISE EXCEPTION 'Invalid response timer';
  END IF;

  SELECT jsonb_build_object('response_timer_minutes', response_timer_minutes, 'response_due_at', response_due_at, 'response_timer_set_at', response_timer_set_at)
  INTO v_previous
  FROM public.terminal_appeal_cases
  WHERE id = p_case_id;

  IF v_previous IS NULL THEN RAISE EXCEPTION 'Appeal case not found'; END IF;

  v_due_at := CASE WHEN p_minutes IS NULL THEN NULL ELSE now() + make_interval(mins => p_minutes) END;

  UPDATE public.terminal_appeal_cases
  SET response_timer_minutes = p_minutes,
      response_due_at = v_due_at,
      response_timer_set_by = v_actor,
      response_timer_set_at = now(),
      status = CASE WHEN status IN ('resolved','closed','cancelled') THEN status ELSE 'respond_by_set' END,
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_case_id;

  PERFORM public.log_terminal_appeal_case_event(
    p_case_id,
    'timer_set',
    jsonb_build_object('response_timer_minutes', p_minutes, 'response_due_at', v_due_at, 'explicit_no_timer', p_minutes IS NULL),
    v_previous,
    CASE WHEN p_minutes IS NULL THEN 'No response timer selected explicitly' ELSE concat('Response timer set for ', p_minutes, ' minutes') END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_terminal_appeal_case(p_case_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case record;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
    RAISE EXCEPTION 'Not authorized to check in appeal';
  END IF;

  SELECT status, response_timer_set_at
  INTO v_case
  FROM public.terminal_appeal_cases
  WHERE id = p_case_id;

  IF v_case IS NULL THEN RAISE EXCEPTION 'Appeal case not found'; END IF;
  IF v_case.status = 'under_appeal' AND v_case.response_timer_set_at IS NULL THEN
    RAISE EXCEPTION 'Select a response timer before checking in this under-appeal case';
  END IF;
  IF v_case.status IN ('resolved','closed','cancelled') THEN
    RAISE EXCEPTION 'Closed, resolved, or cancelled appeal cases cannot be checked in';
  END IF;

  UPDATE public.terminal_appeal_cases
  SET last_checked_in_at = now(),
      last_checked_in_by = v_actor,
      notes = COALESCE(NULLIF(p_note, ''), notes),
      status = 'checked_in',
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_case_id;

  PERFORM public.log_terminal_appeal_case_event(p_case_id, 'checked_in', jsonb_build_object('checked_in_at', now(), 'actor_user_id', v_actor), NULL, p_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_terminal_appeal_status(p_case_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case record;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_terminal_appeal_enabled() THEN RAISE EXCEPTION 'Appeal module is turned off'; END IF;
  IF NOT (public.has_terminal_permission(v_actor, 'terminal_appeals_manage') OR public.has_role(v_actor, 'Super Admin')) THEN
    RAISE EXCEPTION 'Not authorized to update appeal status';
  END IF;
  IF p_status NOT IN ('requested', 'under_appeal', 'respond_by_set', 'checked_in', 'resolved', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid appeal status';
  END IF;

  SELECT status, response_timer_set_at
  INTO v_case
  FROM public.terminal_appeal_cases
  WHERE id = p_case_id;

  IF v_case IS NULL THEN RAISE EXCEPTION 'Appeal case not found'; END IF;

  IF v_case.status IN ('resolved','closed','cancelled') AND p_status NOT IN ('resolved','closed','cancelled') THEN
    RAISE EXCEPTION 'Terminal appeal cases cannot be reopened from this action';
  END IF;

  IF v_case.status = 'under_appeal'
     AND v_case.response_timer_set_at IS NULL
     AND p_status NOT IN ('under_appeal','resolved','closed','cancelled') THEN
    RAISE EXCEPTION 'Select a response timer before moving this under-appeal case forward';
  END IF;

  UPDATE public.terminal_appeal_cases
  SET status = p_status,
      notes = COALESCE(NULLIF(p_note, ''), notes),
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_case_id;

  PERFORM public.log_terminal_appeal_case_event(
    p_case_id,
    CASE WHEN p_status IN ('resolved','closed') THEN p_status ELSE 'status_changed' END,
    jsonb_build_object('status', p_status),
    jsonb_build_object('status', v_case.status),
    p_note
  );
END;
$$;