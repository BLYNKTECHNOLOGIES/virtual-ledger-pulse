DROP TABLE IF EXISTS public.binance_ad_capacity_probe_log;

ALTER TABLE public.binance_ad_capacity_limits
  DROP COLUMN IF EXISTS min_rejected_qty,
  DROP COLUMN IF EXISTS binance_error_code,
  DROP COLUMN IF EXISTS binance_error_message,
  DROP COLUMN IF EXISTS needs_recalibration,
  DROP COLUMN IF EXISTS last_probed_at;

ALTER TABLE public.binance_ad_capacity_limits ALTER COLUMN source SET DEFAULT 'manual';
UPDATE public.binance_ad_capacity_limits SET source = 'manual' WHERE source <> 'manual';