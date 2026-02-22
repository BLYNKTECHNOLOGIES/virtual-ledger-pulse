ALTER TABLE public.hr_payroll_runs 
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS rerun_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rerun_reason text;

-- Mark existing completed runs as locked
UPDATE public.hr_payroll_runs SET is_locked = true, locked_at = now() WHERE status = 'completed';