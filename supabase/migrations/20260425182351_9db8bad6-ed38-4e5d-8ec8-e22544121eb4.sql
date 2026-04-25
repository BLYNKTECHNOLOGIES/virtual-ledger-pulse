ALTER TABLE public.p2p_counterparties
  ADD COLUMN IF NOT EXISTS binance_register_days INTEGER,
  ADD COLUMN IF NOT EXISTS binance_trades_with_us_30d INTEGER,
  ADD COLUMN IF NOT EXISTS binance_counterparty_stats_raw JSONB,
  ADD COLUMN IF NOT EXISTS binance_counterparty_stats_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS binance_counterparty_stats_order_number TEXT;

CREATE INDEX IF NOT EXISTS idx_p2p_counterparties_binance_stats_captured_at
  ON public.p2p_counterparties (binance_counterparty_stats_captured_at DESC)
  WHERE binance_counterparty_stats_captured_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_p2p_counterparties_binance_relationship_risk
  ON public.p2p_counterparties (binance_register_days, binance_trades_with_us_30d);