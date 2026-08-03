ALTER TABLE public.hr_attendance_stale_sessions
  DROP CONSTRAINT IF EXISTS hr_attendance_stale_sessions_status_check;

ALTER TABLE public.hr_attendance_stale_sessions
  ADD CONSTRAINT hr_attendance_stale_sessions_status_check
  CHECK (status = ANY (ARRAY[
    'open'::text,
    'resolved_set_out_time'::text,
    'resolved_confirm_long_shift'::text,
    'resolved_voided'::text,
    'auto_resolved_paired_out'::text
  ]));