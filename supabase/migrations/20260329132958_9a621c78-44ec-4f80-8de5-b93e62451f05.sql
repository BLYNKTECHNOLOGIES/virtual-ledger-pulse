
-- B48: Drop unused dead-code RPCs (no callers in codebase)
DROP FUNCTION IF EXISTS public.create_manual_purchase_bypass(text, text, date, text, numeric, text, text, uuid, uuid, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_bypass_locks(text, text, date, text, numeric, text, uuid, uuid, numeric, numeric, uuid);
