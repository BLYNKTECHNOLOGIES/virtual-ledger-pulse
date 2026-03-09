
-- =====================================================
-- Phase 2: Drift alert mechanism
-- Creates a function that checks the latest snapshot for drift
-- and inserts an alert row when drift exceeds threshold
-- Also creates a drift_alerts table for monitoring
-- =====================================================

CREATE TABLE IF NOT EXISTS public.erp_drift_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES erp_balance_snapshots(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_name text,
  drift numeric NOT NULL,
  tracked_balance numeric,
  calculated_balance numeric,
  severity text NOT NULL DEFAULT 'warning', -- 'warning' or 'critical'
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_drift_alerts_unacked ON erp_drift_alerts(acknowledged_at) WHERE acknowledged_at IS NULL;

-- Function to check latest snapshot and raise alerts
CREATE OR REPLACE FUNCTION public.check_snapshot_drift(
  p_warning_threshold numeric DEFAULT 1.0,
  p_critical_threshold numeric DEFAULT 100.0
)
RETURNS TABLE(entity_type text, entity_name text, drift numeric, severity text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot_id uuid;
BEGIN
  -- Get latest snapshot
  SELECT id INTO v_snapshot_id 
  FROM erp_balance_snapshots ORDER BY created_at DESC LIMIT 1;

  IF v_snapshot_id IS NULL THEN
    RETURN;
  END IF;

  -- Insert drift alerts for entities exceeding threshold
  INSERT INTO erp_drift_alerts (snapshot_id, entity_type, entity_id, entity_name, drift, tracked_balance, calculated_balance, severity)
  SELECT 
    v_snapshot_id,
    l.entity_type,
    l.entity_id,
    l.entity_name,
    l.drift,
    l.tracked_balance,
    l.calculated_balance,
    CASE WHEN ABS(l.drift) >= p_critical_threshold THEN 'critical' ELSE 'warning' END
  FROM erp_balance_snapshot_lines l
  WHERE l.snapshot_id = v_snapshot_id
  AND ABS(l.drift) >= p_warning_threshold
  -- Don't re-alert for same entity+snapshot
  AND NOT EXISTS (
    SELECT 1 FROM erp_drift_alerts da 
    WHERE da.snapshot_id = v_snapshot_id AND da.entity_id = l.entity_id AND da.entity_type = l.entity_type
  );

  -- Return current unacknowledged alerts
  RETURN QUERY
  SELECT da.entity_type, da.entity_name, da.drift, da.severity
  FROM erp_drift_alerts da
  WHERE da.acknowledged_at IS NULL
  ORDER BY ABS(da.drift) DESC;
END;
$$;
