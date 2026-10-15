ALTER TABLE public.ad_rest_timer
  ADD COLUMN IF NOT EXISTS ended_by_mode text,
  ADD COLUMN IF NOT EXISTS ended_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS ended_by_name text;