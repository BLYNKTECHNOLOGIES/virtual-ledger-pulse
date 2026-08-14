ALTER TABLE public.daily_gross_profit_history
  ADD COLUMN IF NOT EXISTS purchase_rate_carried boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_rate_source_date date;