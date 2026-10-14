
-- EP2-A1: one working-day count everywhere
CREATE OR REPLACE FUNCTION public.fn_enforce_leave_balance_on_apply()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_code text; v_name text; v_paid boolean; v_days numeric; v_avail numeric;
BEGIN
  IF COALESCE(NEW.source,'') = 'auto_lop_absorption' OR NEW.leave_type_id IS NULL THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.status,'')) IN ('rejected','cancelled') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(OLD.status,'')) = 'approved' AND lower(NEW.status) = 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.leave_type_id IS NOT DISTINCT FROM OLD.leave_type_id
     AND NEW.start_date = OLD.start_date AND NEW.end_date = OLD.end_date
     AND NEW.total_days IS NOT DISTINCT FROM OLD.total_days
     AND NOT (lower(NEW.status) = 'approved' AND lower(COALESCE(OLD.status,'')) <> 'approved') THEN
    RETURN NEW;
  END IF;
  SELECT code, name, is_paid INTO v_code, v_name, v_paid FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_code = 'LOP' OR NOT COALESCE(v_paid,false) THEN RETURN NEW; END IF;
  -- Same count as the stored total_days (weekly offs and holidays excluded).
  v_days := public.hr_leave_working_days(NEW.employee_id, NEW.start_date, NEW.end_date, COALESCE(NEW.is_half_day,false));
  v_avail := public.hr_leave_available(NEW.employee_id, NEW.leave_type_id, NEW.start_date, NEW.end_date, NEW.id);
  IF v_days > v_avail THEN
    RAISE EXCEPTION 'Not enough % balance: % day(s) available but % working day(s) selected. Apply only the available days as %, and the rest as Loss of Pay (shown as Absent and unpaid).',
      v_name, trim_scale(v_avail), trim_scale(v_days), v_name USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_validate_leave_balance()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_computed numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.leave_type_id IS NULL THEN
      RAISE EXCEPTION 'Pick a leave type before approving this request';
    END IF;
    IF COALESCE(NEW.source,'') = 'auto_lop_absorption' THEN RETURN NEW; END IF;
    v_computed := public.hr_leave_working_days(NEW.employee_id, NEW.start_date, NEW.end_date, COALESCE(NEW.is_half_day,false));
    IF v_computed > 0 AND v_computed IS DISTINCT FROM NEW.total_days THEN
      NEW.total_days := v_computed;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- EP2-A2: who may cancel, and when
CREATE OR REPLACE FUNCTION public.hr_leave_request_field_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_me uuid; v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF auth.uid() IS NULL OR public.hr_is_hr_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  v_me := public.hr_current_employee_id();

  IF v_me IS NOT NULL AND OLD.manager_id = v_me AND OLD.employee_id <> v_me THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.leave_type_id IS DISTINCT FROM OLD.leave_type_id
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.total_days IS DISTINCT FROM OLD.total_days
       OR NEW.is_half_day IS DISTINCT FROM OLD.is_half_day
       OR NEW.paid_days IS DISTINCT FROM OLD.paid_days
       OR NEW.unpaid_days IS DISTINCT FROM OLD.unpaid_days
       OR NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
      RAISE EXCEPTION 'A reporting manager can only record a decision on this leave request';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status NOT IN ('manager_approved','rejected') THEN
        RAISE EXCEPTION 'A reporting manager can only approve or reject this leave request';
      END IF;
      IF lower(COALESCE(OLD.status,'')) IN ('approved','rejected','cancelled') THEN
        RAISE EXCEPTION 'This leave request has already been decided — HR handles any change now';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_me IS NOT NULL AND OLD.employee_id = v_me THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You can only cancel your own leave request';
    END IF;
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.leave_type_id IS DISTINCT FROM OLD.leave_type_id
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.total_days IS DISTINCT FROM OLD.total_days
       OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
       OR NEW.manager_status IS DISTINCT FROM OLD.manager_status
       OR NEW.paid_days IS DISTINCT FROM OLD.paid_days
       OR NEW.unpaid_days IS DISTINCT FROM OLD.unpaid_days THEN
      RAISE EXCEPTION 'You can only cancel your own leave request';
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      IF lower(COALESCE(OLD.status,'')) = 'rejected' THEN
        RAISE EXCEPTION 'This leave request was already rejected';
      END IF;
      IF lower(COALESCE(OLD.status,'')) = 'approved' AND OLD.start_date <= v_today THEN
        RAISE EXCEPTION 'This leave has already started, so it can no longer be cancelled here. Please ask HR — days you come in to work are given back automatically.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to modify this leave request';
END;
$function$;

-- Locked period: no one may cancel/reject an approved leave that touches it
CREATE OR REPLACE FUNCTION public.hr_leave_cancel_lock_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_day date;
BEGIN
  IF lower(COALESCE(OLD.status,'')) = 'approved' AND lower(COALESCE(NEW.status,'')) IN ('cancelled','rejected') THEN
    SELECT g::date INTO v_day FROM generate_series(OLD.start_date, COALESCE(OLD.end_date, OLD.start_date), interval '1 day') g
     WHERE public.hr_v4_is_window_locked(g::date) ORDER BY g LIMIT 1;
    IF v_day IS NOT NULL THEN
      RAISE EXCEPTION 'This leave includes % which is in a locked (closed) period, so it cannot be cancelled or rejected. Carry any correction forward to the next open month.',
        to_char(v_day, 'DD Mon YYYY') USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.hr_leave_cancel_lock_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_leave_cancel_lock_guard ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_leave_cancel_lock_guard BEFORE UPDATE OF status ON public.hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_leave_cancel_lock_guard();

-- Refund only what is still consumed; drop worked-day rows
CREATE OR REPLACE FUNCTION public.fn_leave_balance_on_status_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_remaining numeric; v_taken numeric; v_is_paid boolean; v_code text; v_name text; r record;
        v_restored numeric; v_refund numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code, is_paid, name INTO v_code, v_is_paid, v_name FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
    DELETE FROM public.hr_leave_request_consumption WHERE request_id = NEW.id;
    v_remaining := GREATEST(COALESCE(NEW.total_days,0), 0);
    IF v_code = 'LOP' OR COALESCE(v_is_paid, false) = false THEN
      NEW.paid_days := 0; NEW.unpaid_days := v_remaining;
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NULL, v_remaining, 'unpaid');
      RETURN NEW;
    END IF;
    v_taken := public.hr_leave_take_from(NEW.employee_id, NEW.leave_type_id, NEW.start_date, NEW.end_date, v_remaining);
    IF v_taken < v_remaining AND COALESCE(NEW.source,'') <> 'auto_lop_absorption' THEN
      RAISE EXCEPTION 'Not enough % balance to approve: % day(s) available, % requested. Reject it or change it to Loss of Pay.',
        v_name, trim_scale(v_taken), trim_scale(v_remaining);
    END IF;
    IF v_taken > 0 THEN
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NEW.leave_type_id, v_taken, 'assigned');
    END IF;
    v_remaining := v_remaining - v_taken;
    IF v_remaining > 0 THEN
      INSERT INTO public.hr_leave_request_consumption(request_id, employee_id, leave_type_id, days, source)
      VALUES (NEW.id, NEW.employee_id, NULL, v_remaining, 'unpaid');
    END IF;
    NEW.unpaid_days := GREATEST(v_remaining, 0);
    NEW.paid_days := GREATEST(COALESCE(NEW.total_days,0) - NEW.unpaid_days, 0);
    RETURN NEW;
  END IF;
  IF NEW.status IN ('cancelled','rejected') AND OLD.status = 'approved' THEN
    FOR r IN SELECT leave_type_id, SUM(days) AS days FROM public.hr_leave_request_consumption
              WHERE request_id = OLD.id AND leave_type_id IS NOT NULL GROUP BY leave_type_id LOOP
      -- Days already given back for working on leave are not refunded twice.
      SELECT COALESCE(SUM(days_restored),0) INTO v_restored FROM public.hr_leave_worked_days
       WHERE leave_request_id = OLD.id AND leave_type_id = r.leave_type_id;
      v_refund := GREATEST(r.days - v_restored, 0);
      IF v_refund > 0 THEN
        PERFORM public.hr_move_leave_balance(OLD.employee_id, r.leave_type_id, OLD.start_date, OLD.end_date, v_refund, 1);
      END IF;
    END LOOP;
    DELETE FROM public.hr_leave_worked_days WHERE leave_request_id = OLD.id;
    DELETE FROM public.hr_leave_request_consumption WHERE request_id = OLD.id;
    NEW.paid_days := 0; NEW.unpaid_days := 0;
  END IF;
  RETURN NEW;
END $function$;

-- Clear stamped days with no evidence once an approved leave is withdrawn
CREATE OR REPLACE FUNCTION public.hr_unstamp_leave_attendance(p_request_id uuid, p_employee_id uuid, p_start date, p_end date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_n int := 0; v_from date; v_to date;
BEGIN
  WITH u AS (
    UPDATE public.hr_attendance_daily d
       SET status = 'no_data',
           flags = COALESCE(d.flags,'{}'::jsonb) - 'leave_request_id' - 'auto_leave' - 'lop_leave' - 'worked_on_approved_leave',
           updated_at = now()
     WHERE d.employee_id = p_employee_id
       AND d.attendance_date BETWEEN p_start AND COALESCE(p_end, p_start)
       AND d.flags->>'leave_request_id' = p_request_id::text
       AND d.manual_status IS NULL
       AND COALESCE(d.punch_count,0) = 0 AND d.first_in IS NULL AND COALESCE(d.net_work_minutes,0) = 0
       AND d.status IN ('on_leave','absent')
    RETURNING d.attendance_date)
  SELECT count(*), min(attendance_date), max(attendance_date) INTO v_n, v_from, v_to FROM u;
  IF v_n > 0 THEN
    PERFORM 1 FROM public.hr_v4_recompute_range(p_employee_id, v_from, v_to);
  END IF;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.hr_unstamp_leave_attendance(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_unstamp_leave_attendance(uuid, uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.hr_trg_stamp_leave_attendance()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.source, '') = 'auto_lop_absorption' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status IN ('cancelled','rejected') THEN
    PERFORM public.hr_unstamp_leave_attendance(OLD.id, OLD.employee_id, OLD.start_date, OLD.end_date);
    RETURN NEW;
  END IF;
  PERFORM public.hr_stamp_leave_attendance(NEW.id);
  RETURN NEW;
END;
$function$;

-- EP2-A3: working-day preview
CREATE OR REPLACE FUNCTION public.hr_my_leave_days(p_start date, p_end date, p_half boolean DEFAULT false)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_me uuid := public.hr_current_employee_id();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'No employee record is linked to your account'; END IF;
  IF p_start IS NULL THEN RETURN 0; END IF;
  IF p_end IS NOT NULL AND p_end < p_start THEN RAISE EXCEPTION 'End date is before start date'; END IF;
  RETURN public.hr_leave_working_days(v_me, p_start, COALESCE(p_end, p_start), COALESCE(p_half,false));
END $function$;
REVOKE ALL ON FUNCTION public.hr_my_leave_days(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_my_leave_days(date, date, boolean) TO authenticated, service_role;

-- EP2-A4: my team
CREATE OR REPLACE FUNCTION public.hr_my_team()
 RETURNS TABLE(relation text, employee_id uuid, full_name text, badge_id text, "position" text, phone text, email text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT e.id AS mid, wi.reporting_manager_id AS mgr, wi.department_id AS dept
      FROM public.hr_employees e
      LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
     WHERE e.id = public.hr_current_employee_id()
  ), ppl AS (
    SELECT 'manager'::text AS relation, e.id, 0 AS ord
      FROM me JOIN public.hr_employees e ON e.id = me.mgr AND e.is_active = true AND e.id <> me.mid
    UNION ALL
    SELECT 'colleague', e.id, 1
      FROM me JOIN public.hr_employee_work_info wi ON wi.department_id = me.dept
      JOIN public.hr_employees e ON e.id = wi.employee_id AND e.is_active = true
     WHERE me.dept IS NOT NULL AND e.id <> me.mid AND e.id IS DISTINCT FROM me.mgr
  )
  SELECT p.relation, e.id,
         NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
         e.badge_id::text, COALESCE(pos.title, wi.job_role)::text, e.phone::text,
         CASE WHEN p.relation = 'manager' THEN e.email::text END
    FROM ppl p
    JOIN public.hr_employees e ON e.id = p.id
    LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
    LEFT JOIN public.positions pos ON pos.id = wi.job_position_id
   ORDER BY p.ord, lower(COALESCE(e.first_name,'')), lower(COALESCE(e.last_name,''))
$function$;
REVOKE ALL ON FUNCTION public.hr_my_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_my_team() TO authenticated, service_role;

-- EP2-A5: who's out
CREATE OR REPLACE FUNCTION public.hr_team_leave_window(p_from date, p_to date)
 RETURNS TABLE(employee_id uuid, full_name text, relation text, start_date date, end_date date, is_half_day boolean, half_day_period text, leave_type_name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_me uuid := public.hr_current_employee_id();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Pick a valid date window'; END IF;
  IF p_to - p_from > 30 THEN RAISE EXCEPTION 'The window can be at most 31 days'; END IF;
  RETURN QUERY
  WITH mine AS (
    SELECT wi.reporting_manager_id AS mgr, wi.department_id AS dept
      FROM public.hr_employee_work_info wi WHERE wi.employee_id = v_me
  ), circle AS (
    SELECT v_me AS id, 'me'::text AS rel, 0 AS pr
    UNION ALL
    SELECT e.id, 'manager', 1 FROM mine JOIN public.hr_employees e ON e.id = mine.mgr AND e.is_active
    UNION ALL
    SELECT e.id, 'report', 2 FROM public.hr_employee_work_info wi
      JOIN public.hr_employees e ON e.id = wi.employee_id AND e.is_active
     WHERE wi.reporting_manager_id = v_me
    UNION ALL
    SELECT e.id, 'colleague', 3 FROM mine JOIN public.hr_employee_work_info wi ON wi.department_id = mine.dept
      JOIN public.hr_employees e ON e.id = wi.employee_id AND e.is_active
     WHERE mine.dept IS NOT NULL
  ), c AS (
    SELECT DISTINCT ON (id) id, rel FROM circle WHERE id IS NOT NULL ORDER BY id, pr
  )
  SELECT l.employee_id,
         NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''),
         c.rel, l.start_date, l.end_date, COALESCE(l.is_half_day,false), l.half_day_period::text,
         CASE WHEN c.rel IN ('me','report') THEN lt.name::text END
    FROM public.hr_leave_requests l
    JOIN c ON c.id = l.employee_id
    JOIN public.hr_employees e ON e.id = l.employee_id
    LEFT JOIN public.hr_leave_types lt ON lt.id = l.leave_type_id
   WHERE l.status = 'approved'
     AND COALESCE(l.source,'') <> 'auto_lop_absorption'
     AND l.start_date <= p_to AND COALESCE(l.end_date, l.start_date) >= p_from
   ORDER BY l.start_date, 2;
END $function$;
REVOKE ALL ON FUNCTION public.hr_team_leave_window(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_team_leave_window(date, date) TO authenticated, service_role;

-- EP2-A6: one open bank-change request per employee
CREATE OR REPLACE FUNCTION public.hr_bank_change_one_open_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('pending','pending_razorpay','razorpay_failed') AND EXISTS (
       SELECT 1 FROM public.hr_bank_change_requests b
        WHERE b.employee_id = NEW.employee_id AND b.id <> NEW.id
          AND b.status IN ('pending','pending_razorpay','razorpay_failed')) THEN
    RAISE EXCEPTION 'A bank account change request is already open for this employee. Wait for HR to finish it (or withdraw it) before raising another.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.hr_bank_change_one_open_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_hr_bank_change_one_open ON public.hr_bank_change_requests;
CREATE TRIGGER trg_hr_bank_change_one_open BEFORE INSERT OR UPDATE OF status, employee_id ON public.hr_bank_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_bank_change_one_open_guard();
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_bank_change_one_open
  ON public.hr_bank_change_requests(employee_id) WHERE status IN ('pending','pending_razorpay','razorpay_failed');
