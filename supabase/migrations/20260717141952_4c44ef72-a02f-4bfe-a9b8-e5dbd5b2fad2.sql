UPDATE public.hr_employee_onboarding ob
SET date_of_joining = to_date(m.last_pull_snapshot->>'date-of-hiring', 'DD/MM/YYYY')
FROM public.hr_razorpay_employee_map m
WHERE m.hr_employee_id = ob.employee_id
  AND ob.date_of_joining IS NULL
  AND m.last_pull_snapshot ? 'date-of-hiring'
  AND (m.last_pull_snapshot->>'date-of-hiring') ~ '^\d{2}/\d{2}/\d{4}$';