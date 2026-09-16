-- 1. Bind ad-uptime shift windows to the terminal's existing shifts (hr_shifts)
CREATE OR REPLACE FUNCTION public.sync_terminal_shift_windows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.terminal_shift_windows (shift_key, shift_name, start_time, end_time, sort_order, is_active)
  SELECT
    CASE
      WHEN hs.name ILIKE 'Morning Shift' THEN 'morning'
      WHEN hs.name ILIKE 'Evening Shift' THEN 'evening'
      ELSE 'night'
    END,
    hs.name,
    hs.start_time,
    hs.end_time,
    CASE
      WHEN hs.name ILIKE 'Morning Shift' THEN 1
      WHEN hs.name ILIKE 'Evening Shift' THEN 2
      ELSE 3
    END,
    hs.is_active
  FROM public.hr_shifts hs
  WHERE hs.name ILIKE ANY (ARRAY['Morning Shift', 'Evening Shift', 'Night Shift'])
  ON CONFLICT (shift_key) DO UPDATE SET
    shift_name = EXCLUDED.shift_name,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.sync_terminal_shift_windows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_terminal_shift_windows() TO service_role;

-- Keep them in sync whenever the terminal shift timings change
CREATE OR REPLACE FUNCTION public.trg_sync_terminal_shift_windows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.sync_terminal_shift_windows();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_shifts_sync_terminal_windows ON public.hr_shifts;
CREATE TRIGGER trg_hr_shifts_sync_terminal_windows
AFTER INSERT OR UPDATE OF name, start_time, end_time, is_active ON public.hr_shifts
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_sync_terminal_shift_windows();

SELECT public.sync_terminal_shift_windows();

-- 2. Re-tag already-collected minutes with the real terminal shift, then rebuild today's summary
UPDATE public.terminal_ad_uptime_minutes
SET shift_key = public.terminal_shift_key_for(minute);

DELETE FROM public.terminal_ad_uptime_shift_summary
WHERE ist_date >= ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1);

SELECT public.rollup_terminal_ad_uptime(((now() AT TIME ZONE 'Asia/Kolkata')::date - 1));
SELECT public.rollup_terminal_ad_uptime((now() AT TIME ZONE 'Asia/Kolkata')::date);