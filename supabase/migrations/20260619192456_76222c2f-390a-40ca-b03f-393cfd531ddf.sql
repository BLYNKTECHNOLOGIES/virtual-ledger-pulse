ALTER TABLE public.spot_trade_history ADD COLUMN IF NOT EXISTS exchange_account_id uuid;
ALTER TABLE public.erp_product_conversions ADD COLUMN IF NOT EXISTS exchange_account_id uuid;

-- Backfill existing trades to the primary (ASEC) account, since only the primary
-- account was ever synced historically.
UPDATE public.spot_trade_history
  SET exchange_account_id = '00000000-0000-0000-0000-000000000001'
  WHERE exchange_account_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_spot_trade_history_account_time
  ON public.spot_trade_history (exchange_account_id, trade_time DESC);