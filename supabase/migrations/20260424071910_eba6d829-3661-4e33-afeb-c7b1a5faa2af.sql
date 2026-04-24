-- Fix broken partial unique index on terminal_payer_order_locks.
-- Old index targeted status='locked' which is not a valid status per CHECK constraint.
-- The client inserts status='active', so ON CONFLICT (order_number) was failing with 42P10.

DROP INDEX IF EXISTS public.idx_payer_order_locks_unique_locked;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payer_order_locks_unique_active
  ON public.terminal_payer_order_locks (order_number)
  WHERE status = 'active';