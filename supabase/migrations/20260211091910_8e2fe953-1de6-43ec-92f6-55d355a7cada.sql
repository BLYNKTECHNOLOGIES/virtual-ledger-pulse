
-- Table to store cached Binance P2P order history
CREATE TABLE public.binance_order_history (
  order_number TEXT PRIMARY KEY,
  adv_no TEXT,
  trade_type TEXT,
  asset TEXT DEFAULT 'USDT',
  fiat_unit TEXT DEFAULT 'INR',
  order_status TEXT,
  amount TEXT DEFAULT '0',
  total_price TEXT DEFAULT '0',
  unit_price TEXT DEFAULT '0',
  commission TEXT DEFAULT '0',
  counter_part_nick_name TEXT,
  create_time BIGINT NOT NULL,
  pay_method_name TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for time-based queries
CREATE INDEX idx_binance_orders_create_time ON public.binance_order_history(create_time DESC);
CREATE INDEX idx_binance_orders_status ON public.binance_order_history(order_status);
CREATE INDEX idx_binance_orders_trade_type ON public.binance_order_history(trade_type);

-- Metadata table to track sync state
CREATE TABLE public.binance_sync_metadata (
  id TEXT PRIMARY KEY DEFAULT 'order_history',
  last_sync_at TIMESTAMPTZ,
  last_sync_order_count INTEGER DEFAULT 0,
  last_sync_duration_ms INTEGER DEFAULT 0
);

-- Insert default row
INSERT INTO public.binance_sync_metadata (id) VALUES ('order_history');

-- Enable RLS
ALTER TABLE public.binance_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.binance_sync_metadata ENABLE ROW LEVEL SECURITY;

-- Since this app uses custom auth (not Supabase auth.uid()), 
-- we use permissive policies - security is enforced at the app level
CREATE POLICY "Allow all access to binance_order_history" ON public.binance_order_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to binance_sync_metadata" ON public.binance_sync_metadata FOR ALL USING (true) WITH CHECK (true);
