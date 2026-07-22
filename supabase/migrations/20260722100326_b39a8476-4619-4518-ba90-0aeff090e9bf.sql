-- Align legacy attendance validators with v4 statuses used by the active engine.
CREATE OR REPLACE FUNCTION public.fn_validate_attendance_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.attendance_status NOT IN ('present', 'absent', 'half_day', 'late', 'on_leave', 'incomplete') THEN
    RAISE EXCEPTION 'Invalid attendance status: %. Allowed: present, absent, half_day, late, on_leave, incomplete', NEW.attendance_status;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.hr_attendance_daily
DROP CONSTRAINT IF EXISTS hr_attendance_daily_status_check;

ALTER TABLE public.hr_attendance_daily
ADD CONSTRAINT hr_attendance_daily_status_check
CHECK (status = ANY (ARRAY[
  'present'::text,
  'absent'::text,
  'half_day'::text,
  'late'::text,
  'on_leave'::text,
  'incomplete'::text,
  'no_data'::text
]));

-- Allow HR/admin users to update only through existing authenticated access; no public access is added.
DROP POLICY IF EXISTS "HR admins update biometric device user mappings" ON public.hr_biometric_device_users;
CREATE POLICY "HR admins update biometric device user mappings"
ON public.hr_biometric_device_users
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'Super Admin')
  OR public.has_role(auth.uid(), 'Admin')
  OR public.has_role(auth.uid(), 'HR Manager')
  OR public.has_role(auth.uid(), 'hr')
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'Super Admin')
  OR public.has_role(auth.uid(), 'Admin')
  OR public.has_role(auth.uid(), 'HR Manager')
  OR public.has_role(auth.uid(), 'hr')
  OR public.has_role(auth.uid(), 'super_admin')
);

-- Replay parked punches when a roster row becomes linked, including INSERTs auto-linked by PIN.
CREATE OR REPLACE FUNCTION public.hr_replay_quarantine_on_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q RECORD;
  new_punch_id UUID;
  emp_badge TEXT;
  v_min_date date;
  v_max_date date;
BEGIN
  IF NEW.matched_employee_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.matched_employee_id IS NOT DISTINCT FROM NEW.matched_employee_id THEN RETURN NEW; END IF;

  SELECT badge_id INTO emp_badge FROM public.hr_employees WHERE id = NEW.matched_employee_id;

  FOR q IN
    SELECT * FROM public.hr_attendance_quarantine
    WHERE device_serial = NEW.device_serial
      AND pin = NEW.pin
      AND replayed_at IS NULL
    ORDER BY punch_time ASC
  LOOP
    INSERT INTO public.hr_attendance_punches (
      badge_id, employee_id, punch_time, punch_type, device_name, device_serial, raw_status
    ) VALUES (
      COALESCE(emp_badge, q.pin), NEW.matched_employee_id, q.punch_time,
      COALESCE(q.punch_type, 'in'), 'eSSL Push (replayed)', q.device_serial, q.raw_status
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_punch_id;

    UPDATE public.hr_attendance_quarantine
       SET replayed_at = now(), replayed_punch_id = new_punch_id
     WHERE id = q.id;

    v_min_date := LEAST(COALESCE(v_min_date, public.hr_v4_window_date_of(q.punch_time)),
                        public.hr_v4_window_date_of(q.punch_time));
    v_max_date := GREATEST(COALESCE(v_max_date, public.hr_v4_window_date_of(q.punch_time)),
                           public.hr_v4_window_date_of(q.punch_time));
  END LOOP;

  IF v_min_date IS NOT NULL THEN
    PERFORM public.hr_v4_recompute_range(NEW.matched_employee_id, v_min_date, v_max_date);

    INSERT INTO public.hr_biometric_device_commands (
      device_serial, command_text, status, created_at
    ) VALUES (
      NEW.device_serial,
      'C:' || floor(extract(epoch from now())*1000)::bigint || ':DATA QUERY ATTLOG StartTime='
        || to_char((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '30 days', 'YYYY-MM-DD HH24:MI:SS')
        || ' EndTime=' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
      'pending',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_replay_quarantine ON public.hr_biometric_device_users;
DROP TRIGGER IF EXISTS trg_hr_replay_quarantine_on_mapping ON public.hr_biometric_device_users;
CREATE TRIGGER trg_hr_replay_quarantine_on_mapping
AFTER INSERT OR UPDATE OF matched_employee_id ON public.hr_biometric_device_users
FOR EACH ROW
WHEN (NEW.matched_employee_id IS NOT NULL)
EXECUTE FUNCTION public.hr_replay_quarantine_on_mapping();

-- Auto-fill matched_employee_id when a device PIN already equals an HRMS Badge ID.
CREATE OR REPLACE FUNCTION public.hr_biometric_device_user_auto_match_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.matched_employee_id IS NULL
     AND NEW.pin IS NOT NULL
     AND btrim(NEW.pin) <> '' THEN
    SELECT e.id
      INTO NEW.matched_employee_id
      FROM public.hr_employees e
     WHERE e.badge_id IS NOT NULL
       AND btrim(e.badge_id) = btrim(NEW.pin)
     ORDER BY e.is_active DESC NULLS LAST, e.created_at DESC
     LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_biometric_device_user_auto_match_badge ON public.hr_biometric_device_users;
CREATE TRIGGER trg_hr_biometric_device_user_auto_match_badge
BEFORE INSERT OR UPDATE OF pin, matched_employee_id ON public.hr_biometric_device_users
FOR EACH ROW
EXECUTE FUNCTION public.hr_biometric_device_user_auto_match_badge();

-- If HRMS Badge ID is added/changed after the device roster already exists, backfill matching rows.
CREATE OR REPLACE FUNCTION public.hr_employee_badge_autolink_biometric_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.badge_id IS NOT NULL
     AND btrim(NEW.badge_id) <> ''
     AND (TG_OP = 'INSERT' OR OLD.badge_id IS DISTINCT FROM NEW.badge_id) THEN
    UPDATE public.hr_biometric_device_users u
       SET matched_employee_id = NEW.id,
           updated_at = now()
     WHERE u.matched_employee_id IS NULL
       AND btrim(u.pin) = btrim(NEW.badge_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_employee_badge_autolink_biometric_users ON public.hr_employees;
CREATE TRIGGER trg_hr_employee_badge_autolink_biometric_users
AFTER INSERT OR UPDATE OF badge_id ON public.hr_employees
FOR EACH ROW
EXECUTE FUNCTION public.hr_employee_badge_autolink_biometric_users();

-- Safe helper for the UI/backend: match device PINs to HRMS Badge IDs for one device.
CREATE OR REPLACE FUNCTION public.hr_autolink_biometric_users_by_badge(p_device_serial text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.has_role(auth.uid(), 'Super Admin')
       OR public.has_role(auth.uid(), 'Admin')
       OR public.has_role(auth.uid(), 'HR Manager')
       OR public.has_role(auth.uid(), 'hr')
       OR public.has_role(auth.uid(), 'super_admin')
     ) THEN
    RAISE EXCEPTION 'Permission denied: HR access required';
  END IF;

  UPDATE public.hr_biometric_device_users u
     SET matched_employee_id = e.id,
         updated_at = now()
    FROM public.hr_employees e
   WHERE u.matched_employee_id IS NULL
     AND btrim(u.pin) = btrim(e.badge_id)
     AND e.badge_id IS NOT NULL
     AND btrim(e.badge_id) <> ''
     AND (p_device_serial IS NULL OR u.device_serial = p_device_serial);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'device_serial', p_device_serial,
    'linked_count', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_autolink_biometric_users_by_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_autolink_biometric_users_by_badge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_autolink_biometric_users_by_badge(text) TO service_role;

-- Repair existing rows where the device PIN already matches the HRMS Badge ID.
SELECT public.hr_autolink_biometric_users_by_badge(NULL);