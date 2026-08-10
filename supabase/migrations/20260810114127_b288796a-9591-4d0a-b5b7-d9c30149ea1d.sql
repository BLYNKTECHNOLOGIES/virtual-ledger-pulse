-- ─────────────────────────────────────────────────────────────
-- 1. Schema
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.hr_leave_requests
  ADD COLUMN IF NOT EXISTS manager_id uuid,
  ADD COLUMN IF NOT EXISTS manager_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS manager_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_decided_by uuid,
  ADD COLUMN IF NOT EXISTS manager_remarks text,
  ADD COLUMN IF NOT EXISTS hr_approved_by uuid,
  ADD COLUMN IF NOT EXISTS hr_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_during_leave text,
  ADD COLUMN IF NOT EXISTS paid_days numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_days numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ess';

CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_manager ON public.hr_leave_requests(manager_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON public.hr_leave_requests(status);

-- ─────────────────────────────────────────────────────────────
-- 2. Manager snapshot on insert
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_leave_snapshot_manager()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.manager_id IS NULL THEN
    SELECT wi.reporting_manager_id INTO NEW.manager_id
    FROM public.hr_employee_work_info wi
    WHERE wi.employee_id = NEW.employee_id
    LIMIT 1;
  END IF;

  IF NEW.manager_id IS NULL OR NEW.manager_id = NEW.employee_id THEN
    -- No reporting chain: skip stage 1, go straight to HR.
    NEW.manager_status := 'not_applicable';
    IF NEW.status = 'requested' THEN NEW.status := 'manager_approved'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_leave_snapshot_manager ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_leave_snapshot_manager
  BEFORE INSERT ON public.hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_leave_snapshot_manager();

-- ─────────────────────────────────────────────────────────────
-- 3. Partial-paid split (replaces hard "insufficient balance" failure)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_leave_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_leave_code text;
  v_is_paid boolean;
  v_computed numeric;
  v_avail numeric := 0;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code, is_paid INTO v_leave_code, v_is_paid
    FROM hr_leave_types WHERE id = NEW.leave_type_id;

    IF NEW.is_half_day = true THEN
      v_computed := 0.5;
    ELSE
      v_computed := fn_calculate_leave_days(NEW.employee_id, NEW.start_date, NEW.end_date, NEW.leave_type_id);
    END IF;
    IF v_computed > 0 AND v_computed <> NEW.total_days THEN
      NEW.total_days := v_computed;
    END IF;

    IF v_leave_code = 'LOP' OR COALESCE(v_is_paid, false) = false THEN
      NEW.paid_days := 0;
      NEW.unpaid_days := NEW.total_days;
      RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(available_days), 0) INTO v_avail
    FROM hr_leave_allocations
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year IN (EXTRACT(YEAR FROM NEW.start_date)::int, EXTRACT(YEAR FROM NEW.end_date)::int)
      AND quarter IN (
        CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::int,
        CEIL(EXTRACT(MONTH FROM NEW.end_date) / 3.0)::int
      );

    NEW.paid_days := GREATEST(0, LEAST(NEW.total_days, COALESCE(v_avail, 0)));
    NEW.unpaid_days := GREATEST(0, NEW.total_days - NEW.paid_days);
  END IF;
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Balance movement — consume only the paid portion
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_move_leave_balance(
  p_employee_id uuid, p_leave_type_id uuid, p_start date, p_end date, p_days numeric, p_sign int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record;
  v_remaining numeric := COALESCE(p_days, 0);
  v_take numeric;
BEGIN
  IF v_remaining <= 0 THEN RETURN; END IF;

  IF p_sign > 0 THEN
    -- restore: put days back, earliest bucket first
    FOR r IN
      SELECT id, used_days FROM hr_leave_allocations
      WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
        AND year IN (EXTRACT(YEAR FROM p_start)::int, EXTRACT(YEAR FROM p_end)::int)
        AND quarter IN (CEIL(EXTRACT(MONTH FROM p_start)/3.0)::int, CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int)
      ORDER BY year, quarter
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, GREATEST(r.used_days, 0));
      IF v_take > 0 THEN
        UPDATE hr_leave_allocations
        SET available_days = available_days + v_take,
            used_days = GREATEST(used_days - v_take, 0),
            updated_at = now()
        WHERE id = r.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  ELSE
    FOR r IN
      SELECT id, available_days FROM hr_leave_allocations
      WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
        AND year IN (EXTRACT(YEAR FROM p_start)::int, EXTRACT(YEAR FROM p_end)::int)
        AND quarter IN (CEIL(EXTRACT(MONTH FROM p_start)/3.0)::int, CEIL(EXTRACT(MONTH FROM p_end)/3.0)::int)
      ORDER BY year, quarter
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, GREATEST(r.available_days, 0));
      IF v_take > 0 THEN
        UPDATE hr_leave_allocations
        SET available_days = available_days - v_take,
            used_days = used_days + v_take,
            updated_at = now()
        WHERE id = r.id;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_leave_balance_on_status_change()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM public.hr_move_leave_balance(NEW.employee_id, NEW.leave_type_id,
      NEW.start_date, NEW.end_date, COALESCE(NEW.paid_days, 0), -1);
  END IF;

  IF NEW.status IN ('cancelled','rejected') AND OLD.status = 'approved' THEN
    PERFORM public.hr_move_leave_balance(NEW.employee_id, NEW.leave_type_id,
      NEW.start_date, NEW.end_date, COALESCE(OLD.paid_days, 0), 1);
  END IF;

  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Stamp decisions
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_leave_stamp_decisions()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.manager_status IS DISTINCT FROM OLD.manager_status
     AND NEW.manager_status IN ('approved','rejected') THEN
    NEW.manager_decided_at := COALESCE(NEW.manager_decided_at, now());
    NEW.manager_decided_by := COALESCE(NEW.manager_decided_by, auth.uid());
    IF NEW.manager_status = 'approved' AND NEW.status = 'requested' THEN
      NEW.status := 'manager_approved';
    ELSIF NEW.manager_status = 'rejected' THEN
      NEW.status := 'rejected';
    END IF;
  END IF;

  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.hr_approved_at := COALESCE(NEW.hr_approved_at, now());
    NEW.hr_approved_by := COALESCE(NEW.hr_approved_by, auth.uid());
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_leave_stamp_decisions ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_leave_stamp_decisions
  BEFORE UPDATE ON public.hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_leave_stamp_decisions();

-- ─────────────────────────────────────────────────────────────
-- 6. Notifications for the new stage
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_notify_leave_request_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_employee_name text;
  v_mgr_user uuid;
BEGIN
  SELECT COALESCE(full_name, employee_name, 'Employee') INTO v_employee_name
  FROM public.hr_employees WHERE id = NEW.employee_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.manager_id IS NOT NULL THEN
      SELECT user_id INTO v_mgr_user FROM public.hr_employees WHERE id = NEW.manager_id;
      IF v_mgr_user IS NOT NULL THEN
        PERFORM public.hr_notify(
          ARRAY[v_mgr_user], 'leave_approval_pending', 'Leave approval needed',
          COALESCE(v_employee_name,'Employee') || ' requested leave ' ||
            to_char(NEW.start_date,'DD Mon') || ' – ' || to_char(NEW.end_date,'DD Mon'),
          '/profile?tab=approvals&leaveId=' || NEW.id::text);
      END IF;
    END IF;

    PERFORM public.hr_broadcast_notification_to_hr(
      'leave_request_created', 'New leave request',
      COALESCE(v_employee_name, 'Employee') || ' submitted a leave request',
      '/hrms/leave/requests');

    PERFORM public.hr_emit_notification(
      NEW.employee_id, 'leave_request_submitted', 'Leave request submitted',
      CASE WHEN NEW.manager_id IS NULL
           THEN 'Your leave request was submitted and is awaiting HR approval.'
           ELSE 'Your leave request was submitted and is awaiting your reporting manager.' END,
      '/profile');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'manager_approved' THEN
      PERFORM public.hr_broadcast_notification_to_hr(
        'leave_manager_approved', 'Leave ready for HR approval',
        COALESCE(v_employee_name,'Employee') || '''s leave was approved by the reporting manager',
        '/hrms/leave/requests');
      PERFORM public.hr_emit_notification(
        NEW.employee_id, 'leave_manager_approved', 'Manager approved your leave',
        'Awaiting final HR approval.', '/profile');
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.hr_emit_notification(
        NEW.employee_id, 'leave_request_approved', 'Leave approved',
        CASE WHEN COALESCE(NEW.unpaid_days,0) > 0
             THEN format('Approved: %s paid day(s), %s day(s) as loss of pay.', NEW.paid_days, NEW.unpaid_days)
             ELSE 'Your leave request was approved.' END,
        '/profile');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.hr_emit_notification(
        NEW.employee_id, 'leave_request_rejected', 'Leave rejected',
        'Your leave request was rejected.' || COALESCE(' Reason: ' || NEW.rejection_reason, ''),
        '/profile');
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 7. LOP: credit only the paid portion of approved leave
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_lop_days_window(p_employee_ids uuid[], p_period_month date, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, paid_leave_days numeric, unpaid_leave_days numeric, incomplete_held_days numeric, absent_days numeric, half_days numeric, lop_days numeric, formula text, weekly_off_days integer[], weekly_off_source text, config_errors text[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_win_start   date := GREATEST(date_trunc('month', p_period_month)::date, COALESCE(p_from, date_trunc('month', p_period_month)::date));
  v_win_end     date := LEAST((date_trunc('month', p_period_month) + interval '1 month - 1 day')::date,
                              COALESCE(p_to, (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date));
  v_elapsed_end date;
  v_default_pattern int[] := ARRAY[0];
  v_first_active_pattern int[];
BEGIN
  v_elapsed_end := LEAST(v_win_end, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  IF v_win_end < v_win_start THEN RETURN; END IF;

  SELECT p.weekly_offs INTO v_first_active_pattern
  FROM public.hr_weekly_off_patterns p
  WHERE p.is_active = true AND p.weekly_offs IS NOT NULL AND array_length(p.weekly_offs, 1) > 0
  ORDER BY p.created_at NULLS LAST LIMIT 1;
  IF v_first_active_pattern IS NOT NULL AND array_length(v_first_active_pattern,1) > 0 THEN
    v_default_pattern := v_first_active_pattern;
  END IF;

  RETURN QUERY
  WITH
  hols AS (
    SELECT h.date::date AS d FROM public.hr_holidays h
    WHERE h.is_active = true AND h.date BETWEEN v_month_start AND v_month_end
    UNION
    SELECT make_date(EXTRACT(YEAR FROM v_month_start)::int, EXTRACT(MONTH FROM h.date)::int, EXTRACT(DAY FROM h.date)::int)
    FROM public.hr_holidays h
    WHERE h.is_active = true AND h.recurring = true
      AND EXTRACT(MONTH FROM h.date)::int = EXTRACT(MONTH FROM v_month_start)::int
  ),
  punch_days AS (
    SELECT p.employee_id AS emp_id, (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
    FROM public.hr_attendance_punches p
    WHERE p.employee_id = ANY(p_employee_ids)
      AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_win_start AND v_win_end
    GROUP BY 1,2
  ),
  session_days AS (
    SELECT s.employee_id AS emp_id, s.attendance_date AS dt
    FROM public.hr_attendance_sessions s
    WHERE s.employee_id = ANY(p_employee_ids) AND s.attendance_date BETWEEN v_win_start AND v_win_end
    GROUP BY 1,2
  ),
  evidence_days AS (SELECT emp_id, dt FROM punch_days UNION SELECT emp_id, dt FROM session_days),
  blackout AS (
    SELECT d::date AS dt
    FROM generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d
    WHERE NOT EXISTS (SELECT 1 FROM public.hr_attendance_punches p
                      WHERE (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date = d::date)
  ),
  emp_pat AS (
    SELECT e.id AS emp_id,
      COALESCE((SELECT p.weekly_offs FROM public.hr_employee_weekly_off eo
                JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
                WHERE eo.employee_id = e.id AND eo.is_current = true AND eo.effective_from <= v_month_end
                ORDER BY eo.effective_from DESC LIMIT 1), v_default_pattern) AS off_days,
      CASE WHEN EXISTS (SELECT 1 FROM public.hr_employee_weekly_off eo
                        WHERE eo.employee_id = e.id AND eo.is_current = true) THEN 'per_employee'
           WHEN v_first_active_pattern IS NOT NULL THEN 'tenant_default_pattern'
           ELSE 'hardcoded_sunday' END AS wo_source,
      public.hr_is_contractor(e.id) AS is_contractor,
      GREATEST(v_win_start,
        COALESCE((SELECT wi.joining_date FROM public.hr_employee_work_info wi
                  WHERE wi.employee_id = e.id ORDER BY wi.joining_date NULLS LAST LIMIT 1), v_win_start)) AS emp_from,
      LEAST(v_elapsed_end, COALESCE(e.last_working_day, e.termination_date, v_elapsed_end)) AS emp_to
    FROM public.hr_employees e WHERE e.id = ANY(p_employee_ids)
  ),
  cal AS (
    SELECT ep.emp_id, d::date AS dt, ep.off_days, ep.wo_source,
      CASE WHEN EXTRACT(DOW FROM d)::int = ANY(ep.off_days) THEN false
           WHEN d::date IN (SELECT d FROM hols) THEN false
           ELSE true END AS is_working,
      (d::date >= ep.emp_from AND d::date <= ep.emp_to) AS in_window
    FROM emp_pat ep
    CROSS JOIN generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d
  ),
  wd AS (
    SELECT emp_id, off_days, wo_source,
           COUNT(*) FILTER (WHERE is_working)::numeric AS wdays,
           COUNT(*) FILTER (WHERE is_working AND in_window)::numeric AS wdays_elapsed
    FROM cal GROUP BY emp_id, off_days, wo_source
  ),
  day_rows AS (
    SELECT c.emp_id, c.dt, LOWER(COALESCE(a.status,'')) AS st,
      (COALESCE(a.total_hours,0) > 0 OR a.first_in IS NOT NULL OR COALESCE(a.punch_count,0) > 0
        OR COALESCE(a.session_count,0) > 0 OR ev.dt IS NOT NULL) AS has_evidence,
      EXISTS (SELECT 1 FROM public.hr_attendance_regularization_requests r
              WHERE r.employee_id = c.emp_id AND r.attendance_date = c.dt AND LOWER(r.status) = 'approved') AS regularized,
      (bo.dt IS NOT NULL) AS is_blackout,
      public.hr_stale_session_held(c.emp_id, c.dt) AS stale_held,
      (a.employee_id IS NOT NULL) AS has_daily_row
    FROM cal c
    LEFT JOIN public.hr_attendance_daily a ON a.employee_id = c.emp_id AND a.attendance_date = c.dt
    LEFT JOIN evidence_days ev ON ev.emp_id = c.emp_id AND ev.dt = c.dt
    LEFT JOIN blackout bo ON bo.dt = c.dt
    WHERE c.is_working AND c.in_window
  ),
  att AS (
    SELECT r.emp_id,
      SUM(CASE WHEN r.st = 'half_day' AND (r.has_evidence OR r.regularized) THEN 0.5
               WHEN r.st IN ('absent','on_leave') THEN 0
               WHEN r.has_evidence OR r.regularized THEN 1 ELSE 0 END)::numeric AS present_d,
      SUM(CASE WHEN r.st = 'absent' THEN 1 ELSE 0 END)::numeric AS absent_d,
      SUM(CASE WHEN r.st = 'half_day' THEN 1 ELSE 0 END)::numeric AS half_d,
      SUM(CASE WHEN r.st = 'incomplete' AND (r.stale_held OR r.regularized) THEN 1
               WHEN r.is_blackout AND NOT r.has_evidence AND r.st NOT IN ('absent','on_leave') THEN 1
               ELSE 0 END)::numeric AS incomplete_held_d,
      SUM(CASE WHEN r.st IN ('present','half_day') AND NOT r.has_evidence AND NOT r.regularized
                    AND NOT r.is_blackout THEN 1 ELSE 0 END)::numeric AS unverified_d,
      COUNT(*) FILTER (WHERE r.has_evidence)::numeric AS evidence_day_count
    FROM day_rows r GROUP BY r.emp_id
  ),
  lv AS (
    SELECT lr.employee_id AS emp_id, lt.is_paid, lt.name AS lt_name, lr.leave_type_id,
           lr.start_date, lr.end_date, lr.is_half_day,
           CASE WHEN COALESCE(lr.total_days,0) > 0
                THEN LEAST(1, GREATEST(0, COALESCE(lr.paid_days,0) / lr.total_days))
                ELSE 0 END AS paid_ratio
    FROM public.hr_leave_requests lr
    LEFT JOIN public.hr_leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ANY(p_employee_ids) AND LOWER(lr.status) = 'approved'
      AND lr.start_date <= v_win_end AND lr.end_date >= v_win_start
  ),
  lv_days AS (
    SELECT lv.emp_id, lv.is_paid,
           SUM((CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END) * lv.paid_ratio)::numeric AS paid_days_in_win,
           SUM((CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END) * (1 - lv.paid_ratio))::numeric AS unpaid_days_in_win
    FROM lv
    JOIN LATERAL generate_series(GREATEST(lv.start_date, v_win_start)::timestamp,
                                 LEAST(lv.end_date, v_win_end)::timestamp, interval '1 day') d ON true
    JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true
    WHERE lv.is_paid IS NOT NULL
    GROUP BY lv.emp_id, lv.is_paid
  ),
  lv_cfg AS (
    SELECT emp_id, ARRAY_AGG(DISTINCT format('Leave type "%s" has no paid/unpaid setting — fix it before payroll.',
      COALESCE(lt_name, leave_type_id::text))) AS errs
    FROM lv WHERE is_paid IS NULL GROUP BY emp_id
  ),
  paid   AS (SELECT emp_id, SUM(paid_days_in_win) AS d FROM lv_days WHERE is_paid=true GROUP BY emp_id),
  unpaid AS (SELECT emp_id, SUM(unpaid_days_in_win) AS d FROM lv_days GROUP BY emp_id),
  calc AS (
    SELECT ep.emp_id, ep.is_contractor, ep.off_days, ep.wo_source,
      COALESCE(wd.wdays,0)::numeric AS wdays,
      COALESCE(wd.wdays_elapsed,0)::numeric AS wdays_elapsed,
      COALESCE(att.present_d,0)::numeric AS present_d,
      COALESCE(att.absent_d,0)::numeric AS absent_d,
      COALESCE(att.half_d,0)::numeric AS half_d,
      COALESCE(att.incomplete_held_d,0)::numeric AS held_d,
      COALESCE(att.unverified_d,0)::numeric AS unverified_d,
      COALESCE(att.evidence_day_count,0)::numeric AS evidence_day_count,
      COALESCE(paid.d,0)::numeric AS paid_d,
      COALESCE(unpaid.d,0)::numeric AS unpaid_d,
      COALESCE(lv_cfg.errs, ARRAY[]::text[]) AS errs
    FROM emp_pat ep
    LEFT JOIN wd ON wd.emp_id=ep.emp_id
    LEFT JOIN att ON att.emp_id=ep.emp_id
    LEFT JOIN paid ON paid.emp_id=ep.emp_id
    LEFT JOIN unpaid ON unpaid.emp_id=ep.emp_id
    LEFT JOIN lv_cfg ON lv_cfg.emp_id=ep.emp_id
  )
  SELECT c.emp_id, c.wdays, c.present_d, c.paid_d, c.unpaid_d, c.held_d, c.absent_d, c.half_d,
    CASE WHEN c.is_contractor THEN 0::numeric
         WHEN c.evidence_day_count = 0 AND c.paid_d = 0 AND c.unpaid_d = 0 THEN 0::numeric
         ELSE GREATEST(0, LEAST(c.wdays_elapsed, c.wdays_elapsed - c.present_d - c.paid_d - c.held_d))::numeric END,
    CASE WHEN c.is_contractor
           THEN 'LOP = 0 (contract employee — attendance shown for reference, never deducted)'
         WHEN c.evidence_day_count = 0 AND c.paid_d = 0 AND c.unpaid_d = 0
           THEN 'LOP not derived — no biometric attendance signal in the window (employee not enrolled or device user not mapped).'
         ELSE format('LOP = elapsed WD %s (of %s) − (verified present %s + paid_leave %s + held_harmless %s) = %s%s',
           c.wdays_elapsed, c.wdays, c.present_d, c.paid_d, c.held_d,
           GREATEST(0, LEAST(c.wdays_elapsed, c.wdays_elapsed - c.present_d - c.paid_d - c.held_d)),
           CASE WHEN c.unverified_d > 0
                THEN format(' · %s day(s) marked present with no punch evidence — not counted as attended', c.unverified_d)
                ELSE '' END) END,
    c.off_days::int[], c.wo_source,
    CASE WHEN c.evidence_day_count = 0 AND NOT c.is_contractor
           THEN c.errs || ARRAY['No biometric attendance signal in the window — enrolment/device mapping missing; LOP suppressed for review.']
         ELSE c.errs END
  FROM calc c;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 8. Manager helper + RLS
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_current_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM public.hr_employees WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hr_is_manager_of_leave(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hr_leave_requests lr
    WHERE lr.id = p_request_id
      AND lr.manager_id = public.hr_current_employee_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.hr_current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_is_manager_of_leave(uuid) TO authenticated;

DROP POLICY IF EXISTS "Employees manage own leave requests" ON public.hr_leave_requests;
CREATE POLICY "Employees manage own leave requests"
  ON public.hr_leave_requests FOR SELECT TO authenticated
  USING (employee_id = public.hr_current_employee_id()
         OR manager_id = public.hr_current_employee_id());

DROP POLICY IF EXISTS "Employees insert own leave requests" ON public.hr_leave_requests;
CREATE POLICY "Employees insert own leave requests"
  ON public.hr_leave_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.hr_current_employee_id());

DROP POLICY IF EXISTS "Managers decide team leave requests" ON public.hr_leave_requests;
CREATE POLICY "Managers decide team leave requests"
  ON public.hr_leave_requests FOR UPDATE TO authenticated
  USING (manager_id = public.hr_current_employee_id()
         OR employee_id = public.hr_current_employee_id())
  WITH CHECK (manager_id = public.hr_current_employee_id()
              OR employee_id = public.hr_current_employee_id());