
-- =============================================================
-- Phase 1: WAC-Based Asset Conversion Accounting Schema
-- =============================================================

-- 1a. Extend erp_product_conversions with WAC fields
ALTER TABLE public.erp_product_conversions
  ADD COLUMN IF NOT EXISTS execution_rate_usdt NUMERIC(20,9),
  ADD COLUMN IF NOT EXISTS quantity_gross NUMERIC(20,9),
  ADD COLUMN IF NOT EXISTS quantity_net NUMERIC(20,9),
  ADD COLUMN IF NOT EXISTS local_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS local_currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate_to_usdt NUMERIC(20,9),
  ADD COLUMN IF NOT EXISTS market_rate_snapshot NUMERIC(20,9),
  ADD COLUMN IF NOT EXISTS cost_out_usdt NUMERIC(20,9),
  ADD COLUMN IF NOT EXISTS realized_pnl_usdt NUMERIC(20,9),
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ERP';

-- Backfill existing approved records
UPDATE public.erp_product_conversions
SET
  execution_rate_usdt = price_usd,
  quantity_gross = quantity,
  quantity_net = CASE
    WHEN side = 'BUY' THEN net_asset_change
    ELSE quantity
  END
WHERE execution_rate_usdt IS NULL;

-- 1b. Create wallet_asset_positions (WAC tracker)
CREATE TABLE IF NOT EXISTS public.wallet_asset_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  asset_code TEXT NOT NULL,
  qty_on_hand NUMERIC(20,9) NOT NULL DEFAULT 0,
  cost_pool_usdt NUMERIC(20,9) NOT NULL DEFAULT 0,
  avg_cost_usdt NUMERIC(20,9) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_id, asset_code)
);

ALTER TABLE public.wallet_asset_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view positions"
  ON public.wallet_asset_positions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert positions"
  ON public.wallet_asset_positions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update positions"
  ON public.wallet_asset_positions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- 1c. Create conversion_journal_entries (immutable audit trail)
CREATE TABLE IF NOT EXISTS public.conversion_journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversion_id UUID NOT NULL REFERENCES public.erp_product_conversions(id),
  line_type TEXT NOT NULL,  -- 'ASSET_IN', 'ASSET_OUT', 'USDT_IN', 'USDT_OUT', 'FEE', 'COGS', 'REALIZED_PNL'
  asset_code TEXT NOT NULL,
  qty_delta NUMERIC(20,9) DEFAULT 0,
  usdt_delta NUMERIC(20,9) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversion_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view journal entries"
  ON public.conversion_journal_entries FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert journal entries"
  ON public.conversion_journal_entries FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 1d. Create realized_pnl_events
CREATE TABLE IF NOT EXISTS public.realized_pnl_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversion_id UUID NOT NULL REFERENCES public.erp_product_conversions(id),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  asset_code TEXT NOT NULL,
  sell_qty NUMERIC(20,9) NOT NULL,
  proceeds_usdt_gross NUMERIC(20,9) NOT NULL,
  proceeds_usdt_net NUMERIC(20,9) NOT NULL,
  cost_out_usdt NUMERIC(20,9) NOT NULL,
  realized_pnl_usdt NUMERIC(20,9) NOT NULL,
  avg_cost_at_sale NUMERIC(20,9) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.realized_pnl_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pnl events"
  ON public.realized_pnl_events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert pnl events"
  ON public.realized_pnl_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Indexes for reporting
CREATE INDEX IF NOT EXISTS idx_realized_pnl_wallet_asset ON public.realized_pnl_events(wallet_id, asset_code);
CREATE INDEX IF NOT EXISTS idx_realized_pnl_created ON public.realized_pnl_events(created_at);
CREATE INDEX IF NOT EXISTS idx_journal_conversion ON public.conversion_journal_entries(conversion_id);
CREATE INDEX IF NOT EXISTS idx_positions_wallet ON public.wallet_asset_positions(wallet_id);

-- Seed wallet_asset_positions from existing APPROVED conversions
-- Process BUYs: add to cost pool
INSERT INTO public.wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
SELECT
  wallet_id,
  asset_code,
  SUM(CASE WHEN side = 'BUY' THEN COALESCE(net_asset_change, quantity) ELSE -quantity END) AS qty_on_hand,
  SUM(CASE WHEN side = 'BUY' THEN gross_usd_value ELSE -(quantity * (
    -- approximate avg cost from buys for seed
    SELECT COALESCE(SUM(b.gross_usd_value) / NULLIF(SUM(COALESCE(b.net_asset_change, b.quantity)), 0), 0)
    FROM erp_product_conversions b
    WHERE b.wallet_id = erp_product_conversions.wallet_id
      AND b.asset_code = erp_product_conversions.asset_code
      AND b.side = 'BUY' AND b.status = 'APPROVED'
  )) END) AS cost_pool_usdt,
  0 AS avg_cost_usdt
FROM public.erp_product_conversions
WHERE status = 'APPROVED'
GROUP BY wallet_id, asset_code
ON CONFLICT (wallet_id, asset_code) DO NOTHING;

-- Recalculate avg_cost for seeded positions
UPDATE public.wallet_asset_positions
SET avg_cost_usdt = CASE WHEN qty_on_hand > 0 THEN cost_pool_usdt / qty_on_hand ELSE 0 END;
