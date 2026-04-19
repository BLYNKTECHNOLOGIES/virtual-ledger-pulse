-- Drop P2P counterparty volume breach triggers and function
DROP TRIGGER IF EXISTS trg_check_counterparty_volume_insert ON public.p2p_order_records;
DROP TRIGGER IF EXISTS trg_check_counterparty_volume_update ON public.p2p_order_records;
DROP FUNCTION IF EXISTS public.check_counterparty_volume_threshold() CASCADE;

-- Unschedule stale settlements daily cron and drop function
DO $$
BEGIN
  PERFORM cron.unschedule('flag-stale-settlements-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DROP FUNCTION IF EXISTS public.flag_stale_pending_settlements() CASCADE;

-- Drop dormant TDS overdue alert function
DROP FUNCTION IF EXISTS public.check_tds_overdue_and_alert() CASCADE;

-- Purge existing auto-generated noise tasks
DELETE FROM public.erp_tasks
WHERE 'auto-flagged' = ANY(tags)
  AND ('volume-breach' = ANY(tags) OR 'stale' = ANY(tags));