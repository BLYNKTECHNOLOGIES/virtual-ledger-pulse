
-- Add quarter column to hr_leave_allocations
ALTER TABLE public.hr_leave_allocations ADD COLUMN IF NOT EXISTS quarter integer NOT NULL DEFAULT 1;

-- Drop old unique constraint and create new one with quarter
ALTER TABLE public.hr_leave_allocations DROP CONSTRAINT IF EXISTS hr_leave_allocations_employee_id_leave_type_id_year_key;
ALTER TABLE public.hr_leave_allocations ADD CONSTRAINT hr_leave_allocations_emp_type_year_quarter_key UNIQUE (employee_id, leave_type_id, year, quarter);

-- Update max_days_per_year column comment to clarify it's per quarter now
COMMENT ON COLUMN public.hr_leave_types.max_days_per_year IS 'Max days per quarter (not per year)';
COMMENT ON COLUMN public.hr_leave_allocations.quarter IS 'Quarter number (1-4)';

-- Remove carry_forward related columns from leave types since all leaves carry forward infinitely
-- We keep the columns but they are no longer used in the UI
