
-- Add half_day support to leave requests if not already present
ALTER TABLE public.hr_leave_requests ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN DEFAULT false;
ALTER TABLE public.hr_leave_requests ADD COLUMN IF NOT EXISTS half_day_period TEXT;

-- Create attendance activity table if not exists (policy already exists so use IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'hr_attendance_activity' AND schemaname = 'public') THEN
    CREATE TABLE public.hr_attendance_activity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
      activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
      clock_in TIMESTAMPTZ,
      clock_out TIMESTAMPTZ,
      clock_in_note TEXT,
      clock_out_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE public.hr_attendance_activity ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all access to hr_attendance_activity"
      ON public.hr_attendance_activity FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
