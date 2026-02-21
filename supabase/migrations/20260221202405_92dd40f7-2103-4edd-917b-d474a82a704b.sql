
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS badge_id TEXT UNIQUE;

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_badge_id ON public.users(badge_id) WHERE badge_id IS NOT NULL;
