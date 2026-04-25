ALTER TABLE public.binance_order_history
  ADD COLUMN IF NOT EXISTS order_detail_raw jsonb,
  ADD COLUMN IF NOT EXISTS counterparty_risk_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS counterparty_risk_captured_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_binance_order_history_risk_snapshot_gin
  ON public.binance_order_history USING gin (counterparty_risk_snapshot);

CREATE INDEX IF NOT EXISTS idx_binance_order_history_risk_captured_at
  ON public.binance_order_history (counterparty_risk_captured_at DESC)
  WHERE counterparty_risk_captured_at IS NOT NULL;