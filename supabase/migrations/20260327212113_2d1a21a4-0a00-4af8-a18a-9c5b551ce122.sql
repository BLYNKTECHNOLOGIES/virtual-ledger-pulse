
-- Drop AI reconciliation tables (exclusively used by AI recon system)
DROP TABLE IF EXISTS public.reconciliation_findings CASCADE;
DROP TABLE IF EXISTS public.reconciliation_scan_log CASCADE;

-- Remove AI reconciliation setting from system_settings
DELETE FROM public.system_settings WHERE setting_key = 'ai_reconciliation_enabled';
