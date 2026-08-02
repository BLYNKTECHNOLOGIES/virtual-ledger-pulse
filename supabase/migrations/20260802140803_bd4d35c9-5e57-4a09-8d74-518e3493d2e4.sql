UPDATE public.hr_salary_revisions
SET status = 'APPLIED',
    razorpay_pushed_at = now(),
    razorpay_verified_at = now(),
    razorpay_push_error = NULL,
    revision_reason = 'Bonus',
    razorpay_push_response = jsonb_build_object(
      'ok', true,
      'note', '2026-08-02 re-push: previous label "Ad" was an unreadable addition head on the RazorpayX run. Reset modifications, re-staged as label "Bonus" Rs 5000 (rupees). Echo-verified via payroll:view-payroll.',
      'body', jsonb_build_object(
        'employee-id','70','payroll-month','2026-07','salary',76000,
        'additions', jsonb_build_object('Bonus', jsonb_build_object('name','Bonus','amount',5000,'taxable',1,'type',0))
      )
    ),
    notes = COALESCE(notes,'') || ' | 2026-08-02: re-staged as "Bonus" Rs 5,000 after the "Ad" label proved invisible on the RazorpayX run; live view-payroll confirms it.',
    updated_at = now()
WHERE id = '552da415-6dba-431f-96c3-6db66163b3aa';