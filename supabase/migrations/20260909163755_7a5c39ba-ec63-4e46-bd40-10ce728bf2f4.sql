ALTER TABLE public.small_sales_config
  ADD COLUMN IF NOT EXISTS auto_mark_interval_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS auto_mark_include_buys boolean NOT NULL DEFAULT true;

ALTER TABLE public.small_sales_config
  DROP CONSTRAINT IF EXISTS small_sales_config_auto_mark_interval_check;

ALTER TABLE public.small_sales_config
  ADD CONSTRAINT small_sales_config_auto_mark_interval_check
  CHECK (auto_mark_interval_seconds BETWEEN 10 AND 3600);