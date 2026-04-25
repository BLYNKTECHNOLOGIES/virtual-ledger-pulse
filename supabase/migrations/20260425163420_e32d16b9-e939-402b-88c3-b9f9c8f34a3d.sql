CREATE TABLE IF NOT EXISTS public.binance_commission_rate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id text NOT NULL,
  order_number text,
  adv_no text,
  trade_type text,
  asset text DEFAULT 'USDT',
  fiat_unit text DEFAULT 'INR',
  pay_method_identifier text,
  pay_method_name text,
  pay_id text,
  maker_commission_rate numeric,
  taker_commission_rate numeric,
  effective_commission_rate numeric,
  actual_commission_amount numeric,
  commission_asset text,
  total_price numeric,
  amount numeric,
  raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_binance_commission_snapshots_unique
  ON public.binance_commission_rate_snapshots (
    source_type,
    source_id,
    COALESCE(pay_method_identifier, ''),
    COALESCE(pay_id, '')
  );

CREATE INDEX IF NOT EXISTS idx_binance_commission_snapshots_adv_no
  ON public.binance_commission_rate_snapshots (adv_no);

CREATE INDEX IF NOT EXISTS idx_binance_commission_snapshots_order_number
  ON public.binance_commission_rate_snapshots (order_number);

CREATE INDEX IF NOT EXISTS idx_binance_commission_snapshots_pay_method
  ON public.binance_commission_rate_snapshots (pay_method_identifier);

CREATE INDEX IF NOT EXISTS idx_binance_commission_snapshots_captured_at
  ON public.binance_commission_rate_snapshots (captured_at DESC);

ALTER TABLE public.binance_commission_rate_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_binance_commission_rate_snapshots" ON public.binance_commission_rate_snapshots;
CREATE POLICY "authenticated_all_binance_commission_rate_snapshots"
ON public.binance_commission_rate_snapshots
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_binance_commission_rate_snapshots" ON public.binance_commission_rate_snapshots;
CREATE POLICY "service_all_binance_commission_rate_snapshots"
ON public.binance_commission_rate_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);