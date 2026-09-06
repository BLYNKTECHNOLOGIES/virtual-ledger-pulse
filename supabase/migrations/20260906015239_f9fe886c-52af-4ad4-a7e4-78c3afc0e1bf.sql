CREATE OR REPLACE VIEW public.hr_payroll_lop_drift
WITH (security_invoker = true) AS
WITH months AS (
  SELECT DISTINCT period_month FROM public.hr_payroll_input_deductions WHERE period_month IS NOT NULL
),
base AS (
  SELECT m.period_month, e.id AS employee_id, e.badge_id,
         btrim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')) AS employee_name
  FROM months m
  CROSS JOIN public.hr_employees e
  WHERE coalesce(e.is_active, true)
),
calc AS (
  SELECT b.*,
         coalesce(l.lop_days, 0)::numeric AS raw_lop_days,
         coalesce(co.days_available, 0)::numeric AS compoff_available,
         coalesce(cl.cl_available, 0)::numeric AS cl_available
  FROM base b
  LEFT JOIN LATERAL public.hr_lop_days(ARRAY[b.employee_id], b.period_month) l ON true
  LEFT JOIN LATERAL public.hr_compoff_month_pool(ARRAY[b.employee_id], b.period_month) co ON true
  LEFT JOIN LATERAL public.hr_cl_available(ARRAY[b.employee_id], b.period_month) cl ON true
),
split AS (
  SELECT c.*,
         least(c.compoff_available, c.raw_lop_days) AS compoff_offset_days,
         least(c.cl_available, greatest(c.raw_lop_days - least(c.compoff_available, c.raw_lop_days), 0)) AS cl_offset_days
  FROM calc c
),
final AS (
  SELECT s.*,
         greatest(s.raw_lop_days - s.compoff_offset_days - s.cl_offset_days, 0) AS chargeable_lop_days
  FROM split s
)
SELECT f.period_month,
       f.employee_id,
       f.badge_id,
       f.employee_name,
       f.raw_lop_days,
       f.compoff_available,
       f.compoff_offset_days,
       f.cl_available,
       f.cl_offset_days,
       f.chargeable_lop_days,
       d.id AS deduction_id,
       d.lop_days AS staged_lop_days,
       d.amount AS staged_amount,
       d.pushed_at,
       (d.pushed_at IS NOT NULL) AS is_pushed,
       CASE
         WHEN d.id IS NULL AND f.chargeable_lop_days > 0 THEN 'missing_deduction'
         WHEN d.id IS NOT NULL AND f.chargeable_lop_days = 0 THEN 'stale_deduction'
         WHEN d.id IS NOT NULL AND abs(coalesce(d.lop_days, 0) - f.chargeable_lop_days) > 0.001 THEN 'days_mismatch'
         ELSE 'ok'
       END AS drift_status
FROM final f
LEFT JOIN public.hr_payroll_input_deductions d
  ON d.hr_employee_id = f.employee_id
 AND d.period_month = f.period_month
 AND d.source = 'auto_lop';

GRANT SELECT ON public.hr_payroll_lop_drift TO authenticated;
GRANT SELECT ON public.hr_payroll_lop_drift TO service_role;