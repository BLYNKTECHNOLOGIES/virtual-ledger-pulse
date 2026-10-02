CREATE OR REPLACE FUNCTION public.hr_unlock_attendance_period(_period_start date, _period_end date, _reason text)
 RETURNS TABLE(unlocked_ids uuid[])
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _ids UUID[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _uid AND lower(r.name) IN ('super admin','super_admin','superadmin')
  ) THEN RAISE EXCEPTION 'Only Super Admin can unlock attendance periods'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Unlock reason must be at least 10 characters';
  END IF;

  WITH d AS (
    DELETE FROM public.hr_attendance_period_locks
    WHERE period_start = _period_start AND period_end = _period_end
    RETURNING id
  ) SELECT COALESCE(array_agg(id), '{}') INTO _ids FROM d;

  IF cardinality(_ids) = 0 THEN RAISE EXCEPTION 'No lock found for this period'; END IF;

  INSERT INTO public.hr_attendance_intervention_log (event_type, actor, notes, occurred_at)
  SELECT 'period_unlock', _uid,
         'Unlocked ' || _period_start || '→' || _period_end || ' · Reason: ' || _reason, now()
  WHERE EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hr_attendance_intervention_log');

  unlocked_ids := _ids;
  RETURN NEXT;
END;
$function$;