
-- Asset assignment/return history
CREATE TABLE public.hr_asset_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.hr_assets(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date DATE,
  assigned_by TEXT,
  return_reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_asset_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to hr_asset_assignments" ON public.hr_asset_assignments FOR ALL USING (true) WITH CHECK (true);

-- Add purchase_date and assigned_to_name for quick reference
ALTER TABLE public.hr_assets ADD COLUMN IF NOT EXISTS purchase_date DATE;

CREATE INDEX idx_hr_asset_assignments_asset ON public.hr_asset_assignments(asset_id);
CREATE INDEX idx_hr_asset_assignments_employee ON public.hr_asset_assignments(employee_id);
