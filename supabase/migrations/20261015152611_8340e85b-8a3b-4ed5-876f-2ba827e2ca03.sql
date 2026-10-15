ALTER TABLE public.ad_rest_timer
  ADD COLUMN IF NOT EXISTS start_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;
UPDATE public.ad_rest_timer SET start_completed_at = started_at WHERE start_completed_at IS NULL;