
-- 1. Create terminal_sales_sync table
CREATE TABLE public.terminal_sales_sync (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  binance_order_number text NOT NULL UNIQUE,
  sync_status text NOT NULL DEFAULT 'synced_pending_approval',
  order_data jsonb,
  client_id uuid REFERENCES public.clients(id),
  counterparty_name text,
  contact_number text,
  state text,
  sales_order_id uuid REFERENCES public.sales_orders(id),
  rejection_reason text,
  synced_by text,
  synced_at timestamptz DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz
);

-- 2. Create counterparty_contact_records table
CREATE TABLE public.counterparty_contact_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  counterparty_nickname text NOT NULL UNIQUE,
  contact_number text,
  state text,
  collected_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Add source and terminal_sync_id to sales_orders
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS terminal_sync_id uuid REFERENCES public.terminal_sales_sync(id);

-- 4. RLS for terminal_sales_sync
ALTER TABLE public.terminal_sales_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to terminal_sales_sync" ON public.terminal_sales_sync FOR ALL USING (true) WITH CHECK (true);

-- 5. RLS for counterparty_contact_records
ALTER TABLE public.counterparty_contact_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to counterparty_contact_records" ON public.counterparty_contact_records FOR ALL USING (true) WITH CHECK (true);

-- 6. Index for faster lookups
CREATE INDEX idx_terminal_sales_sync_status ON public.terminal_sales_sync(sync_status);
CREATE INDEX idx_terminal_sales_sync_order_number ON public.terminal_sales_sync(binance_order_number);
