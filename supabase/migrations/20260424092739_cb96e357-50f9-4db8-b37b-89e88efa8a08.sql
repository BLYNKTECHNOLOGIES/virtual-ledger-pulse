-- 1. Replace partial unique index with full unique constraint on payer locks
DROP INDEX IF EXISTS public.idx_payer_order_locks_unique_active;

ALTER TABLE public.terminal_payer_order_locks
  ADD CONSTRAINT terminal_payer_order_locks_order_number_key UNIQUE (order_number);

-- 2. Allow 'processing' as a transient status for small_sales_sync to enable atomic claim
ALTER TABLE public.small_sales_sync
  DROP CONSTRAINT IF EXISTS small_sales_sync_sync_status_check;

ALTER TABLE public.small_sales_sync
  ADD CONSTRAINT small_sales_sync_sync_status_check
  CHECK (sync_status IN ('pending_approval','processing','approved','rejected'));

-- 3. Same for small_buys_sync
ALTER TABLE public.small_buys_sync
  DROP CONSTRAINT IF EXISTS small_buys_sync_sync_status_check;

ALTER TABLE public.small_buys_sync
  ADD CONSTRAINT small_buys_sync_sync_status_check
  CHECK (sync_status IN ('pending_approval','processing','approved','rejected'));