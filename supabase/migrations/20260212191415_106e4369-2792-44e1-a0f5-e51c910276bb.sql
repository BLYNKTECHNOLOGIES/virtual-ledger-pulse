
-- AI Reconciliation Findings table
CREATE TABLE public.reconciliation_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL,
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'orders',
  asset TEXT,
  terminal_ref TEXT,
  erp_ref TEXT,
  terminal_amount NUMERIC(20,4),
  erp_amount NUMERIC(20,4),
  variance NUMERIC(20,4),
  suggested_action TEXT,
  confidence NUMERIC(3,2) DEFAULT 0.50,
  ai_reasoning TEXT,
  details JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  feedback_by UUID,
  feedback_at TIMESTAMPTZ,
  feedback_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI Reconciliation Scan Log table
CREATE TABLE public.reconciliation_scan_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_by TEXT,
  scan_scope TEXT[] DEFAULT ARRAY['all'],
  findings_count INT DEFAULT 0,
  critical_count INT DEFAULT 0,
  warning_count INT DEFAULT 0,
  review_count INT DEFAULT 0,
  info_count INT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  ai_summary TEXT
);

-- Add FK from findings to scan_log
ALTER TABLE public.reconciliation_findings
  ADD CONSTRAINT reconciliation_findings_scan_id_fkey
  FOREIGN KEY (scan_id) REFERENCES public.reconciliation_scan_log(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.reconciliation_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_scan_log ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow all authenticated users to read, only system to write
CREATE POLICY "Allow authenticated read on findings" ON public.reconciliation_findings FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert on findings" ON public.reconciliation_findings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update on findings" ON public.reconciliation_findings FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete on findings" ON public.reconciliation_findings FOR DELETE USING (true);

CREATE POLICY "Allow authenticated read on scan_log" ON public.reconciliation_scan_log FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert on scan_log" ON public.reconciliation_scan_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update on scan_log" ON public.reconciliation_scan_log FOR UPDATE USING (true);

-- Insert AI reconciliation toggle setting
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('ai_reconciliation_enabled', 'true', 'Global toggle for AI Reconciliation Assist feature')
ON CONFLICT (setting_key) DO NOTHING;

-- Indexes for performance
CREATE INDEX idx_reconciliation_findings_scan_id ON public.reconciliation_findings(scan_id);
CREATE INDEX idx_reconciliation_findings_status ON public.reconciliation_findings(status);
CREATE INDEX idx_reconciliation_findings_type ON public.reconciliation_findings(finding_type);
CREATE INDEX idx_reconciliation_findings_severity ON public.reconciliation_findings(severity);
CREATE INDEX idx_reconciliation_findings_category ON public.reconciliation_findings(category);
CREATE INDEX idx_reconciliation_scan_log_status ON public.reconciliation_scan_log(status);
