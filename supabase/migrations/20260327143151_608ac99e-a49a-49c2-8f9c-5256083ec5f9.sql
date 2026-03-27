ALTER TABLE public.erp_tasks
  ADD COLUMN IF NOT EXISTS reminder_hours_before integer;