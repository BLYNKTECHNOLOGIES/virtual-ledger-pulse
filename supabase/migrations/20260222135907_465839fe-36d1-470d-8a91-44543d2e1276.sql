CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_employee_date_unique 
ON public.hr_attendance (employee_id, attendance_date);