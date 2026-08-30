DELETE FROM public.ad_pricing_logs WHERE status = 'dry_run';
ALTER TABLE public.ad_pricing_rules DROP COLUMN IF EXISTS is_dry_run;