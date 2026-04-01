
-- Phase 1: Price Snapshots Table
CREATE TABLE public.price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL,
  usdt_price numeric NOT NULL,
  source text DEFAULT 'Binance',
  fetched_at timestamptz DEFAULT now(),
  entry_type text, -- 'purchase_approval', 'sales_entry', 'transfer', 'conversion', 'batch_approval'
  reference_id uuid,
  reference_type text, -- 'purchase_order', 'sales_order', 'wallet_transaction', 'conversion'
  requested_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_price_snapshots_asset ON public.price_snapshots(asset_code);
CREATE INDEX idx_price_snapshots_ref ON public.price_snapshots(reference_id, reference_type);

ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read price snapshots" ON public.price_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert price snapshots" ON public.price_snapshots FOR INSERT TO authenticated WITH CHECK (true);

-- Phase 2: Add USDT valuation columns to wallet_transactions
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS market_rate_usdt numeric,
  ADD COLUMN IF NOT EXISTS effective_usdt_qty numeric,
  ADD COLUMN IF NOT EXISTS effective_usdt_rate numeric,
  ADD COLUMN IF NOT EXISTS price_snapshot_id uuid REFERENCES public.price_snapshots(id);

-- Phase 4: Immutability trigger for effective USDT values
CREATE OR REPLACE FUNCTION public.prevent_effective_usdt_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- If effective values were previously set and are being changed, block
  IF OLD.effective_usdt_qty IS NOT NULL AND NEW.effective_usdt_qty IS DISTINCT FROM OLD.effective_usdt_qty THEN
    RAISE EXCEPTION 'Cannot modify effective_usdt_qty once set. Use adjustment entries for corrections.';
  END IF;
  IF OLD.effective_usdt_rate IS NOT NULL AND NEW.effective_usdt_rate IS DISTINCT FROM OLD.effective_usdt_rate THEN
    RAISE EXCEPTION 'Cannot modify effective_usdt_rate once set. Use adjustment entries for corrections.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_po_effective_usdt
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  WHEN (OLD.effective_usdt_qty IS NOT NULL)
  EXECUTE FUNCTION public.prevent_effective_usdt_modification();

CREATE TRIGGER protect_so_effective_usdt
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW
  WHEN (OLD.effective_usdt_qty IS NOT NULL)
  EXECUTE FUNCTION public.prevent_effective_usdt_modification();

-- Phase 5: Batch USDT valuations table
CREATE TABLE public.batch_usdt_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  batch_type text NOT NULL, -- 'small_buys', 'small_sales'
  asset_code text NOT NULL,
  total_inr_value numeric NOT NULL DEFAULT 0,
  total_asset_qty numeric NOT NULL DEFAULT 0,
  market_rate_usdt numeric NOT NULL,
  aggregated_usdt_qty numeric NOT NULL DEFAULT 0,
  effective_usdt_rate numeric,
  strategy text NOT NULL DEFAULT 'AGGREGATE',
  order_id uuid,
  price_snapshot_id uuid REFERENCES public.price_snapshots(id),
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_batch_valuations_batch ON public.batch_usdt_valuations(batch_id);

ALTER TABLE public.batch_usdt_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read batch valuations" ON public.batch_usdt_valuations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert batch valuations" ON public.batch_usdt_valuations FOR INSERT TO authenticated WITH CHECK (true);

-- Add market_rate_usdt to wallet_fee_deductions if missing
ALTER TABLE public.wallet_fee_deductions
  ADD COLUMN IF NOT EXISTS market_rate_usdt_snapshot numeric,
  ADD COLUMN IF NOT EXISTS price_fetched_at timestamptz;
