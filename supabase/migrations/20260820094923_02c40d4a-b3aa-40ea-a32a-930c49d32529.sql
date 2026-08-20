CREATE INDEX IF NOT EXISTS idx_binance_order_history_acct_time
  ON public.binance_order_history (exchange_account_id, create_time DESC);