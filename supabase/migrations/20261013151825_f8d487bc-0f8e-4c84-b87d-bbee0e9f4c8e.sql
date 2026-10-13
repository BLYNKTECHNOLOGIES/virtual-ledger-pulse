UPDATE public.hr_employee_work_info SET work_type = 'On-site' WHERE lower(trim(work_type)) IN ('office','on-site','onsite','work from office');
UPDATE public.hr_employee_work_info SET work_type = 'Remote' WHERE lower(trim(work_type)) IN ('work from home','wfh','remote') AND work_type <> 'Remote';
UPDATE public.hr_employee_work_info SET work_type = 'Hybrid' WHERE lower(trim(work_type)) = 'hybrid' AND work_type <> 'Hybrid';
ALTER TABLE public.hr_employee_work_info ALTER COLUMN work_type SET DEFAULT 'On-site';
ALTER TABLE public.hr_employees ALTER COLUMN last_name SET DEFAULT '';