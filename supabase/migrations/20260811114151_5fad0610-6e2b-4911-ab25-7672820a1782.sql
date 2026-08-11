CREATE OR REPLACE VIEW public.hr_monthly_hours_unified
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT
    d.employee_id,
    date_trunc('month', d.attendance_date)::date AS month,
    count(*) FILTER (WHERE d.status = 'present')     AS present_days,
    count(*) FILTER (WHERE d.status = 'absent')      AS absent_days,
    count(*) FILTER (WHERE d.status = 'half_day')    AS half_days,
    count(*) FILTER (WHERE d.status = 'incomplete')  AS incomplete_days,
    count(*) FILTER (WHERE d.status = 'no_data')     AS no_punch_days,
    COALESCE(sum(d.net_work_minutes), 0)             AS net_work_minutes,
    count(*) FILTER (WHERE COALESCE(d.late_by_minutes,0) > 0)      AS late_count,
    COALESCE(sum(d.late_by_minutes), 0)                            AS late_minutes,
    count(*) FILTER (WHERE COALESCE(d.early_by_minutes,0) > 0)     AS early_out_count,
    COALESCE(sum(d.early_by_minutes), 0)                           AS early_minutes
  FROM public.hr_attendance_daily d
  GROUP BY d.employee_id, date_trunc('month', d.attendance_date)::date
)
SELECT
  ha.employee_id,
  make_date(ha.year, ha.month_sequence, 1)                AS month,
  ha.year,
  ha.month_sequence,
  e.badge_id,
  btrim(concat_ws(' ', e.first_name, e.last_name))        AS employee_name,
  dep.name                                                AS department,
  sh.name                                                 AS shift_name,
  ha.hour_account_second                                  AS worked_seconds,
  ha.hour_pending_second                                  AS pending_seconds,
  ha.overtime_second                                      AS overtime_seconds,
  GREATEST(ha.hour_account_second + ha.hour_pending_second - ha.overtime_second, 0) AS required_seconds,
  COALESCE(dl.present_days, 0)      AS present_days,
  COALESCE(dl.absent_days, 0)       AS absent_days,
  COALESCE(dl.half_days, 0)         AS half_days,
  COALESCE(dl.incomplete_days, 0)   AS incomplete_days,
  COALESCE(dl.no_punch_days, 0)     AS no_punch_days,
  COALESCE(dl.net_work_minutes, 0)  AS net_work_minutes,
  COALESCE(dl.late_count, 0)        AS late_count,
  COALESCE(dl.late_minutes, 0)      AS late_minutes,
  COALESCE(dl.early_out_count, 0)   AS early_out_count,
  COALESCE(dl.early_minutes, 0)     AS early_minutes,
  ha.updated_at
FROM public.hr_hour_accounts ha
JOIN public.hr_employees e ON e.id = ha.employee_id AND e.is_active = true
LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = ha.employee_id
LEFT JOIN public.departments dep ON dep.id = wi.department_id
LEFT JOIN public.hr_shifts sh ON sh.id = wi.shift_id
LEFT JOIN daily dl ON dl.employee_id = ha.employee_id
                  AND dl.month = make_date(ha.year, ha.month_sequence, 1);

GRANT SELECT ON public.hr_monthly_hours_unified TO authenticated;
GRANT SELECT ON public.hr_monthly_hours_unified TO service_role;