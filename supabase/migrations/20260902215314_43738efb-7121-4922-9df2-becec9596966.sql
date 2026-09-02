ALTER TABLE public.hr_leave_allocations ADD COLUMN IF NOT EXISTS month integer;

-- Backfill legacy manual allocations with their actual creation month (IST)
UPDATE public.hr_leave_allocations
SET month = EXTRACT(MONTH FROM created_at AT TIME ZONE 'Asia/Kolkata')::int
WHERE month IS NULL AND quarter IS NOT NULL AND quarter > 0;

COMMENT ON COLUMN public.hr_leave_allocations.month IS 'Attribution month (1-12) for manual allocations; NULL for cumulative monthly-accrual buckets (quarter=0).';