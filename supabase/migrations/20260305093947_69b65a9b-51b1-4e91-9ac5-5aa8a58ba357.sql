
-- Table to store shift reconciliation submissions and their results
CREATE TABLE public.shift_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shift_label TEXT, -- e.g. "Morning Shift", "Night Shift"
  
  -- The raw CSV data submitted by operator
  submitted_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- ERP snapshot at time of comparison
  erp_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Comparison results with mismatches
  comparison_result JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Whether there were any mismatches outside tolerance
  has_mismatches BOOLEAN NOT NULL DEFAULT false,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  
  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'pending_review', -- pending_review, approved, rejected, resubmitted
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Link to parent if this is a resubmission
  parent_reconciliation_id UUID REFERENCES public.shift_reconciliations(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick history lookups
CREATE INDEX idx_shift_reconciliations_status ON public.shift_reconciliations(status);
CREATE INDEX idx_shift_reconciliations_submitted_at ON public.shift_reconciliations(submitted_at DESC);

-- Enable RLS
ALTER TABLE public.shift_reconciliations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read and insert
CREATE POLICY "Authenticated users can view shift reconciliations"
  ON public.shift_reconciliations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert shift reconciliations"
  ON public.shift_reconciliations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update shift reconciliations"
  ON public.shift_reconciliations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
