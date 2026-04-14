
-- Create client_binance_nicknames table
CREATE TABLE public.client_binance_nicknames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'sync_auto',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_nickname UNIQUE (nickname)
);

-- Index for fast client lookups
CREATE INDEX idx_client_binance_nicknames_client_id ON public.client_binance_nicknames(client_id);
CREATE INDEX idx_client_binance_nicknames_active ON public.client_binance_nicknames(nickname) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.client_binance_nicknames ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view nickname links"
ON public.client_binance_nicknames FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert nickname links"
ON public.client_binance_nicknames FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update nickname links"
ON public.client_binance_nicknames FOR UPDATE
TO authenticated
USING (true);

-- Backfill from existing approved terminal_sales_sync records
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (order_data->>'counterparty_nickname')
  client_id,
  order_data->>'counterparty_nickname',
  'sync_auto',
  MIN(synced_at) OVER (PARTITION BY order_data->>'counterparty_nickname'),
  MAX(synced_at) OVER (PARTITION BY order_data->>'counterparty_nickname')
FROM public.terminal_sales_sync
WHERE client_id IS NOT NULL
  AND sync_status IN ('approved', 'synced_pending_approval')
  AND order_data->>'counterparty_nickname' IS NOT NULL
  AND order_data->>'counterparty_nickname' != ''
  AND (order_data->>'counterparty_nickname') NOT LIKE '%*%'
ORDER BY order_data->>'counterparty_nickname', synced_at DESC
ON CONFLICT (nickname) DO NOTHING;

-- Backfill from existing approved terminal_purchase_sync records
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (order_data->>'counterparty_nickname')
  client_id,
  order_data->>'counterparty_nickname',
  'sync_auto',
  MIN(synced_at) OVER (PARTITION BY order_data->>'counterparty_nickname'),
  MAX(synced_at) OVER (PARTITION BY order_data->>'counterparty_nickname')
FROM public.terminal_purchase_sync
WHERE client_id IS NOT NULL
  AND sync_status IN ('approved', 'synced_pending_approval')
  AND order_data->>'counterparty_nickname' IS NOT NULL
  AND order_data->>'counterparty_nickname' != ''
  AND (order_data->>'counterparty_nickname') NOT LIKE '%*%'
ORDER BY order_data->>'counterparty_nickname', synced_at DESC
ON CONFLICT (nickname) DO NOTHING;
