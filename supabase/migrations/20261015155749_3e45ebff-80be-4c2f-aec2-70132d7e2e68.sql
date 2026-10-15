ALTER TABLE public.ad_rest_timer
  ADD COLUMN IF NOT EXISTS end_lease_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_completed_at timestamptz;
UPDATE public.ad_rest_timer
  SET end_completed_at = COALESCE(ended_at, started_at)
  WHERE is_active = false AND end_completed_at IS NULL;