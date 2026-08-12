CREATE TABLE public.hr_attendance_notice_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status_at_send text NOT NULL,
  email text NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  campaign_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_attendance_notice_log_unique UNIQUE (employee_id, attendance_date)
);

GRANT SELECT ON public.hr_attendance_notice_log TO authenticated;
GRANT ALL ON public.hr_attendance_notice_log TO service_role;

ALTER TABLE public.hr_attendance_notice_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view attendance notices"
ON public.hr_attendance_notice_log
FOR SELECT
TO authenticated
USING (public.hr_is_hr_staff(auth.uid()));

CREATE INDEX idx_hr_attendance_notice_log_date ON public.hr_attendance_notice_log (attendance_date DESC);

CREATE TRIGGER trg_hr_attendance_notice_log_updated_at
BEFORE UPDATE ON public.hr_attendance_notice_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();