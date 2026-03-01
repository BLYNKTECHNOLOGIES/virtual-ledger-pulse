ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS widget_settings JSONB DEFAULT '{}'::jsonb;