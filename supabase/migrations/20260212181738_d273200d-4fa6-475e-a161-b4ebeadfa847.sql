
-- 1. Small Sales Config (single-row upsert table)
CREATE TABLE public.small_sales_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  min_amount NUMERIC(20,4) NOT NULL DEFAULT 200,
  max_amount NUMERIC(20,4) NOT NULL DEFAULT 4000,
  currency TEXT NOT NULL DEFAULT 'INR',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.small_sales_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_sales_config" ON public.small_sales_config FOR ALL USING (true) WITH CHECK (true);

-- Insert default row
INSERT INTO public.small_sales_config (is_enabled, min_amount, max_amount, currency) VALUES (true, 200, 4000, 'INR');

-- 2. Small Sales Sync (clubbed records)
CREATE TABLE public.small_sales_sync (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_batch_id TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  order_count INT NOT NULL DEFAULT 0,
  total_quantity NUMERIC(20,9) NOT NULL DEFAULT 0,
  total_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  avg_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_fee NUMERIC(20,9) NOT NULL DEFAULT 0,
  wallet_id UUID,
  wallet_name TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_approval',
  sales_order_id UUID,
  order_numbers TEXT[] NOT NULL DEFAULT '{}',
  time_window_start TIMESTAMPTZ,
  time_window_end TIMESTAMPTZ,
  synced_by TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);

ALTER TABLE public.small_sales_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_sales_sync" ON public.small_sales_sync FOR ALL USING (true) WITH CHECK (true);

-- 3. Small Sales Sync Log
CREATE TABLE public.small_sales_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_batch_id TEXT NOT NULL,
  sync_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_completed_at TIMESTAMPTZ,
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  total_orders_processed INT NOT NULL DEFAULT 0,
  entries_created INT NOT NULL DEFAULT 0,
  synced_by TEXT
);

ALTER TABLE public.small_sales_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_sales_sync_log" ON public.small_sales_sync_log FOR ALL USING (true) WITH CHECK (true);

-- 4. Small Sales Order Map (traceability)
CREATE TABLE public.small_sales_order_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  small_sales_sync_id UUID NOT NULL REFERENCES public.small_sales_sync(id) ON DELETE CASCADE,
  binance_order_number TEXT NOT NULL,
  order_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_small_sales_order_number UNIQUE (binance_order_number)
);

ALTER TABLE public.small_sales_order_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to small_sales_order_map" ON public.small_sales_order_map FOR ALL USING (true) WITH CHECK (true);

-- 5. Add sale_type column to sales_orders
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'regular';

-- 6. Sequence for SM order numbers
CREATE SEQUENCE IF NOT EXISTS small_sales_order_seq START WITH 1 INCREMENT BY 1;
