
-- =============================================
-- Phase 1: ERP-Terminal Integration Schema
-- =============================================

-- 1.1 Terminal Wallet Links
CREATE TABLE public.terminal_wallet_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  platform_source text NOT NULL DEFAULT 'terminal',
  api_identifier text NOT NULL DEFAULT 'binance_p2p',
  supported_assets text[] NOT NULL DEFAULT '{USDT}',
  fee_treatment text NOT NULL DEFAULT 'capitalize',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_wallet_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view terminal wallet links"
  ON public.terminal_wallet_links FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage terminal wallet links"
  ON public.terminal_wallet_links FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 1.2 Counterparty PAN Records
CREATE TABLE public.counterparty_pan_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_nickname text NOT NULL UNIQUE,
  pan_number text NOT NULL,
  collected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.counterparty_pan_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view PAN records"
  ON public.counterparty_pan_records FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage PAN records"
  ON public.counterparty_pan_records FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 1.3 Terminal Purchase Sync
CREATE TABLE public.terminal_purchase_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binance_order_number text NOT NULL UNIQUE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id),
  sync_status text NOT NULL DEFAULT 'synced_pending_approval',
  order_data jsonb NOT NULL DEFAULT '{}',
  client_id uuid REFERENCES public.clients(id),
  counterparty_name text NOT NULL,
  pan_number text,
  synced_by uuid,
  synced_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_purchase_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view terminal sync records"
  ON public.terminal_purchase_sync FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage terminal sync records"
  ON public.terminal_purchase_sync FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 1.4 Add source and terminal_sync_id to purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS terminal_sync_id uuid REFERENCES public.terminal_purchase_sync(id);

-- Updated_at trigger for terminal_wallet_links
CREATE TRIGGER update_terminal_wallet_links_updated_at
  BEFORE UPDATE ON public.terminal_wallet_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for counterparty_pan_records
CREATE TRIGGER update_counterparty_pan_records_updated_at
  BEFORE UPDATE ON public.counterparty_pan_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
