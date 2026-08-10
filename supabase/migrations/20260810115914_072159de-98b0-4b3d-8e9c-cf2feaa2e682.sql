ALTER TABLE public.hr_leave_requests DROP CONSTRAINT IF EXISTS chk_leave_request_status;
ALTER TABLE public.hr_leave_requests ADD CONSTRAINT chk_leave_request_status
  CHECK (status IN ('requested','manager_approved','approved','rejected','cancelled'));
ALTER TABLE public.hr_leave_requests DROP CONSTRAINT IF EXISTS chk_leave_manager_status;
ALTER TABLE public.hr_leave_requests ADD CONSTRAINT chk_leave_manager_status
  CHECK (manager_status IN ('pending','approved','rejected','not_applicable'));