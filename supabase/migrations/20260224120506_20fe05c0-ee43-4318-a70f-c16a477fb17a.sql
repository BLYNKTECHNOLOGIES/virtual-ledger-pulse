
-- Small Buys Config (single-row, mirrors small_sales_config)
CREATE TABLE public.small_buys_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  min_amount NUMERIC NOT NULL DEFAULT 200,
  max_amount NUMERIC NOT NULL DEFAULT 4000,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.small_buys_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_buys_config" ON public.small_buys_config FOR ALL USING (true) WITH CHECK (true);

-- Insert default config row
INSERT INTO public.small_buys_config (is_enabled, min_amount, max_amount) VALUES (true, 200, 4000);

-- Small Buys Sync (clubbed records, mirrors small_sales_sync)
CREATE TABLE public.small_buys_sync (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_batch_id TEXT,
  asset_code TEXT NOT NULL DEFAULT 'USDT',
  order_count INTEGER NOT NULL DEFAULT 0,
  total_quantity NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  avg_price NUMERIC NOT NULL DEFAULT 0,
  total_fee NUMERIC NOT NULL DEFAULT 0,
  wallet_id UUID,
  wallet_name TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_approval',
  order_numbers TEXT[],
  time_window_start TIMESTAMPTZ,
  time_window_end TIMESTAMPTZ,
  synced_by TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purchase_order_id UUID,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);
ALTER TABLE public.small_buys_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_buys_sync" ON public.small_buys_sync FOR ALL USING (true) WITH CHECK (true);

-- Small Buys Sync Log (execution log, mirrors small_sales_sync_log)
CREATE TABLE public.small_buys_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_batch_id TEXT,
  sync_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_completed_at TIMESTAMPTZ,
  time_window_start TIMESTAMPTZ,
  time_window_end TIMESTAMPTZ,
  total_orders_processed INTEGER NOT NULL DEFAULT 0,
  entries_created INTEGER NOT NULL DEFAULT 0,
  synced_by TEXT
);
ALTER TABLE public.small_buys_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_buys_sync_log" ON public.small_buys_sync_log FOR ALL USING (true) WITH CHECK (true);

-- Small Buys Order Map (traceability, mirrors small_sales_order_map)
CREATE TABLE public.small_buys_order_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  small_buys_sync_id UUID NOT NULL REFERENCES public.small_buys_sync(id) ON DELETE CASCADE,
  binance_order_number TEXT NOT NULL,
  order_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.small_buys_order_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_buys_order_map" ON public.small_buys_order_map FOR ALL USING (true) WITH CHECK (true);

-- Unique index on order map to prevent duplicate syncing
CREATE UNIQUE INDEX idx_small_buys_order_map_order_number ON public.small_buys_order_map(binance_order_number);

-- Sequence for SB-prefixed order numbers
CREATE SEQUENCE public.small_buys_order_seq START 1;
