CREATE INDEX IF NOT EXISTS idx_release_deadline_log_checked_at ON public.p2p_release_deadline_monitor_log (checked_at);
CREATE INDEX IF NOT EXISTS idx_auto_pay_engine_runs_started_at ON public.p2p_auto_pay_engine_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_ad_state_snapshots_captured_at ON public.binance_ad_state_snapshots (captured_at);