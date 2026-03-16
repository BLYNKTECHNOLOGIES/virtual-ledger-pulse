-- Drop unused tables that have no code references, no data dependencies, no FK references, and no triggers

-- 1. debug_po_log: Old debugging table with 982 rows of stale debug data, never queried by any code
DROP TABLE IF EXISTS public.debug_po_log;

-- 2. email_verification_tokens: Empty table (0 rows), no code references, FK to auth.users only (no reverse FKs)
DROP TABLE IF EXISTS public.email_verification_tokens;

-- 3. password_reset_tokens: Empty table (0 rows), no code references anywhere
DROP TABLE IF EXISTS public.password_reset_tokens;