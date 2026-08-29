ALTER TABLE public.hr_attendance_policies
  ADD COLUMN IF NOT EXISTS full_day_threshold_minutes integer NOT NULL DEFAULT 400;

UPDATE public.hr_attendance_policies
   SET full_day_threshold_minutes = 400
 WHERE full_day_threshold_minutes IS NULL OR full_day_threshold_minutes <= 0;

CREATE OR REPLACE FUNCTION public.hr_v4_half_day_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT p.half_day_threshold_minutes
       FROM public.hr_attendance_policies p
      WHERE p.is_active = true
      ORDER BY p.is_default DESC NULLS LAST, p.created_at ASC
      LIMIT 1),
    (SELECT (half_day_net_hours*60)::int FROM public.hr_attendance_engine_settings LIMIT 1),
    240
  );
$$;

CREATE OR REPLACE FUNCTION public.hr_v4_full_day_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    public.hr_v4_half_day_minutes(),
    COALESCE(
      (SELECT p.full_day_threshold_minutes
         FROM public.hr_attendance_policies p
        WHERE p.is_active = true
        ORDER BY p.is_default DESC NULLS LAST, p.created_at ASC
        LIMIT 1),
      400
    )
  );
$$;

REVOKE ALL ON FUNCTION public.hr_v4_half_day_minutes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_v4_full_day_minutes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_v4_half_day_minutes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_v4_full_day_minutes() TO authenticated, service_role;

DO $do$
DECLARE
  v_def text;
  v_old text;
  v_new text;
  v_count int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_v4_recompute_range';

  v_old := '             WHEN m.net_work_minutes < (SELECT (half_day_net_hours*60)::int FROM public.hr_attendance_engine_settings LIMIT 1)' || chr(10)
        || '                  THEN ''half_day''' || chr(10)
        || '             ELSE ''present''';

  v_new := '             WHEN m.net_work_minutes < public.hr_v4_half_day_minutes() THEN ''absent''' || chr(10)
        || '             WHEN m.net_work_minutes < public.hr_v4_full_day_minutes() THEN ''half_day''' || chr(10)
        || '             ELSE ''present''';

  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 status blocks in hr_v4_recompute_range, found %', v_count;
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$do$;