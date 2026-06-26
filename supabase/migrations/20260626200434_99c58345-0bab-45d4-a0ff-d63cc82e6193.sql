CREATE TABLE public.erp_terminal_balance_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  exchange_account_id uuid,
  account_name text NOT NULL,
  erp_usdt_balance numeric NOT NULL DEFAULT 0,
  terminal_usdt_balance numeric,
  difference numeric,
  capture_status text NOT NULL DEFAULT 'ok',
  capture_error text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, exchange_account_id)
);

GRANT SELECT ON public.erp_terminal_balance_snapshots TO authenticated;
GRANT ALL ON public.erp_terminal_balance_snapshots TO service_role;

ALTER TABLE public.erp_terminal_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read balance diff snapshots"
ON public.erp_terminal_balance_snapshots
FOR SELECT
TO authenticated
USING (true);