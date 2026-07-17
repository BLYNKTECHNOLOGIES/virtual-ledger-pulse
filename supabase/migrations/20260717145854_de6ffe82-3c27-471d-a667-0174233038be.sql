
-- Extend hr_salary_revisions to also capture one-time bonuses / incentives / adjustments
ALTER TABLE public.hr_salary_revisions
  ADD COLUMN IF NOT EXISTS one_time_amount numeric,
  ADD COLUMN IF NOT EXISTS payout_month date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Widen the revision_type check to include one-time compensation kinds
ALTER TABLE public.hr_salary_revisions DROP CONSTRAINT IF EXISTS hr_salary_revisions_type_check;
ALTER TABLE public.hr_salary_revisions
  ADD CONSTRAINT hr_salary_revisions_type_check
  CHECK (revision_type = ANY (ARRAY[
    'increment','promotion','correction','demotion',
    'bonus','performance_incentive','special_allowance','retention_bonus','ad_hoc'
  ]));

-- Index for profile history queries
CREATE INDEX IF NOT EXISTS idx_hr_salary_revisions_employee_effective
  ON public.hr_salary_revisions (employee_id, effective_from DESC);

-- Convenience: separation date = when an employee moved to inactive after FNF
-- (already tracked via is_active + hr_fnf_settlements.paid_at). No column change needed.
