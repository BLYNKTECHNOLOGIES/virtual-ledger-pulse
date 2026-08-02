UPDATE public.hr_salary_revisions
SET status = 'APPLIED',
    razorpay_pushed_at = now(),
    razorpay_verified_at = now(),
    razorpay_push_error = NULL,
    razorpay_push_response = '{"ok":true,"body":{"employee-id":"70","payroll-month":"2026-07","salary":76000,"additions":{"Ad":{"name":"Ad","amount":5000,"taxable":1,"type":0}}},"note":"re-pushed 2026-08-02 in rupees; echo verified via payroll view-payroll"}'::jsonb,
    notes = COALESCE(notes, '') || ' | 2026-08-02: re-pushed to RazorpayX at correct rupee amount (5000); echo-verified via view-payroll.'
WHERE id = '552da415-6dba-431f-96c3-6db66163b3aa';