
-- Unified asset movement history cache table
CREATE TABLE IF NOT EXISTS public.asset_movement_history (
  id TEXT PRIMARY KEY,
  movement_type TEXT NOT NULL, -- 'deposit', 'withdrawal', 'transfer'
  asset TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  fee NUMERIC DEFAULT 0,
  status TEXT,
  network TEXT,
  tx_id TEXT,
  address TEXT,
  transfer_direction TEXT, -- e.g. 'Funding → Spot', 'Spot → Funding'
  raw_data JSONB,
  movement_time BIGINT NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_movement_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated select on asset_movement_history"
  ON public.asset_movement_history FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert on asset_movement_history"
  ON public.asset_movement_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update on asset_movement_history"
  ON public.asset_movement_history FOR UPDATE USING (true);

CREATE INDEX idx_asset_movement_type ON public.asset_movement_history(movement_type);
CREATE INDEX idx_asset_movement_time ON public.asset_movement_history(movement_time DESC);

-- Sync metadata for asset movements
CREATE TABLE IF NOT EXISTS public.asset_movement_sync_metadata (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_sync_at TIMESTAMPTZ,
  last_deposit_time BIGINT DEFAULT 0,
  last_withdraw_time BIGINT DEFAULT 0,
  last_transfer_time BIGINT DEFAULT 0
);

ALTER TABLE public.asset_movement_sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated select on movement_sync" ON public.asset_movement_sync_metadata FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert on movement_sync" ON public.asset_movement_sync_metadata FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update on movement_sync" ON public.asset_movement_sync_metadata FOR UPDATE USING (true);

INSERT INTO public.asset_movement_sync_metadata (id) VALUES ('default');
