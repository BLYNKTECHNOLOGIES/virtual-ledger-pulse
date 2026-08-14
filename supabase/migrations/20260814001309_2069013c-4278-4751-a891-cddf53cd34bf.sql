CREATE OR REPLACE VIEW public.hr_erp_account_health_v AS
WITH ex AS (
  SELECT user_id, upper(btrim(badge_id)) AS badge_id FROM public.hr_erp_account_exemptions
),
u AS (
  SELECT
    us.id AS user_id,
    us.username,
    us.status,
    NULLIF(btrim(us.badge_id), '') AS badge_id,
    upper(btrim(coalesce(us.badge_id, ''))) AS badge_key,
    lower(btrim(coalesce(us.email, ''))) AS email_key,
    us.email,
    us.phone,
    btrim(coalesce(us.first_name, '') || ' ' || coalesce(us.last_name, '')) AS full_name
  FROM public.users us
  WHERE lower(coalesce(us.username, '')) NOT LIKE 'deleted\_%' ESCAPE '\'
    AND lower(coalesce(us.email, '')) NOT LIKE 'deleted+%'
    AND upper(btrim(coalesce(us.first_name, ''))) <> 'DELETED:'
    AND upper(btrim(coalesce(us.first_name, ''))) <> 'DELETED'
    AND NOT EXISTS (
      SELECT 1 FROM ex
      WHERE (ex.user_id IS NOT NULL AND ex.user_id = us.id)
         OR (ex.badge_id IS NOT NULL AND ex.badge_id = upper(btrim(coalesce(us.badge_id, ''))))
    )
),
e AS (
  SELECT
    em.id AS hr_employee_id,
    em.is_active,
    NULLIF(btrim(em.badge_id), '') AS badge_id,
    upper(btrim(coalesce(em.badge_id, ''))) AS badge_key,
    lower(btrim(coalesce(em.email, ''))) AS email_key,
    em.email,
    em.phone,
    btrim(coalesce(em.first_name, '') || ' ' || coalesce(em.last_name, '')) AS full_name
  FROM public.hr_employees em
),
linked AS (
  SELECT DISTINCT ON (u.user_id)
    u.*,
    e.hr_employee_id,
    e.is_active AS emp_active,
    e.badge_id AS emp_badge_id,
    e.email AS emp_email,
    e.phone AS emp_phone,
    e.full_name AS emp_full_name,
    CASE WHEN u.badge_key <> '' AND u.badge_key = e.badge_key THEN 'badge' ELSE 'email' END AS match_by
  FROM u
  LEFT JOIN e
    ON (u.badge_key <> '' AND u.badge_key = e.badge_key)
    OR (u.email_key <> '' AND u.email_key = e.email_key)
  ORDER BY u.user_id, (CASE WHEN u.badge_key <> '' AND u.badge_key = e.badge_key THEN 0 ELSE 1 END), e.is_active DESC NULLS LAST
)
SELECT
  'missing_badge'::text AS issue_type,
  l.user_id, l.username, l.badge_id AS erp_badge_id, l.status AS erp_status,
  l.hr_employee_id, l.emp_badge_id, l.emp_full_name, l.emp_active,
  NULL::text AS field, NULL::text AS erp_value, NULL::text AS hrms_value,
  l.full_name AS erp_full_name, l.email AS erp_email, l.phone AS erp_phone,
  CASE WHEN l.hr_employee_id IS NULL THEN 'critical' ELSE 'high' END::text AS severity
FROM linked l
WHERE l.badge_id IS NULL AND l.hr_employee_id IS NOT NULL
UNION ALL
SELECT
  'no_employee', l.user_id, l.username, l.badge_id, l.status,
  NULL::uuid, NULL::text, NULL::text, NULL::boolean,
  NULL, NULL, NULL,
  l.full_name, l.email, l.phone, 'critical'
FROM linked l
WHERE l.hr_employee_id IS NULL AND l.badge_id IS NULL
UNION ALL
SELECT
  'orphan_badge', l.user_id, l.username, l.badge_id, l.status,
  NULL::uuid, NULL::text, NULL::text, NULL::boolean,
  NULL, NULL, NULL,
  l.full_name, l.email, l.phone, 'high'
FROM linked l
WHERE l.badge_id IS NOT NULL AND l.hr_employee_id IS NULL
UNION ALL
SELECT
  'mismatch', l.user_id, l.username, l.badge_id, l.status,
  l.hr_employee_id, l.emp_badge_id, l.emp_full_name, l.emp_active,
  m.field, m.erp_value, m.hrms_value,
  l.full_name, l.email, l.phone, 'medium'
FROM linked l
CROSS JOIN LATERAL (
  VALUES
    ('email', l.email, l.emp_email,
      lower(btrim(coalesce(l.email, ''))) <> lower(btrim(coalesce(l.emp_email, '')))
      AND coalesce(l.emp_email, '') <> ''),
    ('phone', l.phone, l.emp_phone,
      regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') <> regexp_replace(coalesce(l.emp_phone, ''), '\D', '', 'g')
      AND regexp_replace(coalesce(l.emp_phone, ''), '\D', '', 'g') <> ''),
    ('full_name', l.full_name, l.emp_full_name,
      lower(regexp_replace(coalesce(l.full_name, ''), '[^a-zA-Z]', '', 'g')) <> lower(regexp_replace(coalesce(l.emp_full_name, ''), '[^a-zA-Z]', '', 'g'))
      AND btrim(coalesce(l.emp_full_name, '')) <> '')
) AS m(field, erp_value, hrms_value, is_drift)
WHERE l.hr_employee_id IS NOT NULL AND m.is_drift
UNION ALL
SELECT
  'active_login_inactive_employee', l.user_id, l.username, l.badge_id, l.status,
  l.hr_employee_id, l.emp_badge_id, l.emp_full_name, l.emp_active,
  'active_state', l.status, 'inactive',
  l.full_name, l.email, l.phone, 'critical'
FROM linked l
WHERE l.hr_employee_id IS NOT NULL AND l.emp_active = false AND upper(coalesce(l.status, '')) <> 'INACTIVE'
UNION ALL
SELECT
  'employee_without_erp', NULL::uuid, NULL::text, NULL::text, NULL::text,
  e.hr_employee_id, e.badge_id, e.full_name, e.is_active,
  NULL, NULL, NULL,
  NULL, e.email, e.phone, 'medium'
FROM e
WHERE e.is_active
  AND NOT EXISTS (
    SELECT 1 FROM u
    WHERE (u.badge_key <> '' AND u.badge_key = e.badge_key)
       OR (u.email_key <> '' AND u.email_key = e.email_key)
  );

GRANT SELECT ON public.hr_erp_account_health_v TO authenticated;
GRANT SELECT ON public.hr_erp_account_health_v TO service_role;