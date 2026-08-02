CREATE OR REPLACE FUNCTION public.hr_payroll_cockpit_authorized(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND (
        lower(replace(r.name,'_',' ')) IN ('super admin','admin','hr','hr manager','hr admin','coo')
        OR lower(r.name) LIKE 'hr%'
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.hr_payroll_cockpit_authorized(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_cockpit_ack_step(_month date, _step_no smallint, _status text, _notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _first DATE := date_trunc('month', _month)::date;
BEGIN
  IF NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _status NOT IN ('pending','done','skipped','blocked') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;
  INSERT INTO public.hr_payroll_cockpit_state (period_month, step_no, status, actor, notes, acknowledged_at)
  VALUES (_first, _step_no, _status, auth.uid(), _notes, CASE WHEN _status='done' THEN now() ELSE NULL END)
  ON CONFLICT (period_month, step_no)
  DO UPDATE SET status = EXCLUDED.status,
                actor = auth.uid(),
                notes = EXCLUDED.notes,
                acknowledged_at = CASE WHEN EXCLUDED.status='done' THEN now() ELSE NULL END,
                updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_close_payroll_month(_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _first DATE := date_trunc('month', _month)::date;
  _rec RECORD;
  _blockers TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR _rec IN
    SELECT step_no, step_label, live_status, ack_status
    FROM public.hr_cockpit_month_state(_first)
    WHERE step_no <= 8
  LOOP
    IF _rec.ack_status IS DISTINCT FROM 'done'
       AND _rec.ack_status IS DISTINCT FROM 'skipped'
       AND _rec.live_status <> 'complete' THEN
      _blockers := array_append(_blockers, format('Step %s: %s', _rec.step_no, _rec.step_label));
    END IF;
  END LOOP;
  IF array_length(_blockers, 1) > 0 THEN
    RETURN jsonb_build_object('closed', false, 'blockers', to_jsonb(_blockers));
  END IF;
  PERFORM public.hr_cockpit_ack_step(_first, 9::SMALLINT, 'done', 'Month closed');
  RETURN jsonb_build_object('closed', true, 'month', _first);
END;
$function$;