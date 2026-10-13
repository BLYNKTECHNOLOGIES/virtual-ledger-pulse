ALTER TABLE public.ats_settings
  ADD COLUMN IF NOT EXISTS ai_drafts_enabled boolean NOT NULL DEFAULT false;