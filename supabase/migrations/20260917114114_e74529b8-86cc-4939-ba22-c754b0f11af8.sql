ALTER TABLE public.terminal_exchange_accounts
  ADD COLUMN IF NOT EXISTS ad_uptime_tracked boolean NOT NULL DEFAULT false;

UPDATE public.terminal_exchange_accounts
SET ad_uptime_tracked = (credential_key = 'default');