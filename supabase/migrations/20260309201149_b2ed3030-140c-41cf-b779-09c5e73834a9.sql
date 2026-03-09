
-- =====================================================
-- ERP Balance Snapshot System
-- Captures hourly checkpoints of all financial state
-- for variance detection and debugging
-- =====================================================

-- Main snapshot header table (one row per snapshot run)
CREATE TABLE public.erp_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_type TEXT NOT NULL DEFAULT 'SCHEDULED',
  summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshot detail lines (one row per entity per snapshot)
CREATE TABLE public.erp_balance_snapshot_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.erp_balance_snapshots(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  asset_code TEXT,
  tracked_balance NUMERIC NOT NULL DEFAULT 0,
  calculated_balance NUMERIC,
  drift NUMERIC GENERATED ALWAYS AS (tracked_balance - COALESCE(calculated_balance, tracked_balance)) STORED,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_snapshots_at ON public.erp_balance_snapshots(snapshot_at DESC);
CREATE INDEX idx_snapshot_lines_lookup ON public.erp_balance_snapshot_lines(snapshot_id, entity_type, entity_id);
CREATE INDEX idx_snapshot_lines_entity ON public.erp_balance_snapshot_lines(entity_type, entity_id, snapshot_id);
CREATE INDEX idx_snapshot_lines_drift ON public.erp_balance_snapshot_lines(entity_type) WHERE drift != 0;

-- RLS
ALTER TABLE public.erp_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_balance_snapshot_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view snapshots"
  ON public.erp_balance_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert snapshots"
  ON public.erp_balance_snapshots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view snapshot lines"
  ON public.erp_balance_snapshot_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert snapshot lines"
  ON public.erp_balance_snapshot_lines FOR INSERT TO authenticated WITH CHECK (true);

-- Cleanup function: delete snapshots older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.erp_balance_snapshots
  WHERE snapshot_at < now() - INTERVAL '30 days';
END;
$$;

-- Variance detection helper: compare two snapshots
CREATE OR REPLACE FUNCTION public.compare_snapshots(
  p_snapshot_id_old UUID,
  p_snapshot_id_new UUID
)
RETURNS TABLE (
  entity_type TEXT,
  entity_id TEXT,
  entity_name TEXT,
  asset_code TEXT,
  old_balance NUMERIC,
  new_balance NUMERIC,
  balance_change NUMERIC,
  old_drift NUMERIC,
  new_drift NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    COALESCE(n.entity_type, o.entity_type) as entity_type,
    COALESCE(n.entity_id, o.entity_id) as entity_id,
    COALESCE(n.entity_name, o.entity_name) as entity_name,
    COALESCE(n.asset_code, o.asset_code) as asset_code,
    COALESCE(o.tracked_balance, 0) as old_balance,
    COALESCE(n.tracked_balance, 0) as new_balance,
    COALESCE(n.tracked_balance, 0) - COALESCE(o.tracked_balance, 0) as balance_change,
    COALESCE(o.drift, 0) as old_drift,
    COALESCE(n.drift, 0) as new_drift
  FROM erp_balance_snapshot_lines n
  FULL OUTER JOIN erp_balance_snapshot_lines o 
    ON o.entity_type = n.entity_type 
    AND o.entity_id = n.entity_id 
    AND COALESCE(o.asset_code, '') = COALESCE(n.asset_code, '')
    AND o.snapshot_id = p_snapshot_id_old
  WHERE n.snapshot_id = p_snapshot_id_new
  AND (COALESCE(n.tracked_balance, 0) - COALESCE(o.tracked_balance, 0)) != 0
  ORDER BY ABS(COALESCE(n.tracked_balance, 0) - COALESCE(o.tracked_balance, 0)) DESC;
$$;
