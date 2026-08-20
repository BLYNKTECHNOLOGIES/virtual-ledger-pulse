-- 1. Backfill unambiguous links
WITH cand AS (
  SELECT e.id AS emp_id, u.id AS uid,
         ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY u.created_at) rn,
         COUNT(*) OVER (PARTITION BY e.id) c_emp,
         COUNT(*) OVER (PARTITION BY u.id) c_usr
  FROM public.hr_employees e
  JOIN public.users u ON (
        (e.badge_id IS NOT NULL AND u.badge_id = e.badge_id)
     OR (coalesce(e.email,'') <> '' AND lower(u.email) = lower(e.email))
     OR (coalesce(e.phone,'') <> '' AND regexp_replace(coalesce(u.phone,''),'\D','','g') = regexp_replace(e.phone,'\D','','g'))
  )
  WHERE e.user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.hr_employees e2 WHERE e2.user_id = u.id)
)
UPDATE public.hr_employees e
SET user_id = c.uid
FROM cand c
WHERE e.id = c.emp_id AND c.c_emp = 1 AND c.c_usr = 1;

-- 2. Self-service resolver so future badge assignments heal on first profile visit
CREATE OR REPLACE FUNCTION public.hr_link_self_employee()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_badge text;
  v_email text;
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_emp FROM public.hr_employees WHERE user_id = v_uid
   ORDER BY is_active DESC, created_at DESC LIMIT 1;
  IF v_emp IS NOT NULL THEN RETURN v_emp; END IF;

  SELECT badge_id, email, regexp_replace(coalesce(phone,''),'\D','','g')
    INTO v_badge, v_email, v_phone
  FROM public.users WHERE id = v_uid;

  SELECT id INTO v_emp FROM public.hr_employees
   WHERE user_id IS NULL AND v_badge IS NOT NULL AND badge_id = v_badge
   LIMIT 2;
  IF v_emp IS NULL AND coalesce(v_email,'') <> '' THEN
    SELECT id INTO v_emp FROM public.hr_employees
     WHERE user_id IS NULL AND lower(email) = lower(v_email) LIMIT 2;
  END IF;
  IF v_emp IS NULL AND coalesce(v_phone,'') <> '' THEN
    SELECT id INTO v_emp FROM public.hr_employees
     WHERE user_id IS NULL AND regexp_replace(coalesce(phone,''),'\D','','g') = v_phone LIMIT 2;
  END IF;

  IF v_emp IS NOT NULL THEN
    UPDATE public.hr_employees SET user_id = v_uid WHERE id = v_emp AND user_id IS NULL;
  END IF;
  RETURN v_emp;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_link_self_employee() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_link_self_employee() TO authenticated;