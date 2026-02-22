ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS pf_number text,
  ADD COLUMN IF NOT EXISTS uan_number text,
  ADD COLUMN IF NOT EXISTS esi_number text;