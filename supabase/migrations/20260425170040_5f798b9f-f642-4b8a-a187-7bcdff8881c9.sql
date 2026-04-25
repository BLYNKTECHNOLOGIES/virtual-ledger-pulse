CREATE TABLE IF NOT EXISTS public.binance_merchant_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_status integer NOT NULL,
  business_status_label text NOT NULL,
  kyc_passed boolean,
  user_kyc_status text,
  kyc_type integer,
  nickname text,
  country_code text,
  register_days integer,
  bind_mobile_status text,
  over_complained integer,
  source text NOT NULL DEFAULT 'baseDetail',
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.binance_merchant_state_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_view_binance_merchant_state_snapshots" ON public.binance_merchant_state_snapshots;
CREATE POLICY "authenticated_view_binance_merchant_state_snapshots"
ON public.binance_merchant_state_snapshots
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_binance_merchant_state_checked_at
ON public.binance_merchant_state_snapshots(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_binance_merchant_state_business_status
ON public.binance_merchant_state_snapshots(business_status);