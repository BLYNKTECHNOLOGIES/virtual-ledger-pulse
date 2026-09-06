
-- Wrongly-directed recovery: August was paid at the OLD CTC, so nothing is owed back.
DELETE FROM public.hr_payroll_input_deductions
 WHERE id = '735b3213-a244-4454-895e-ddf53a3eecbd';

-- Arrears actually due: (13000 - 10000) * 12 days / 31 = 1161
INSERT INTO public.hr_payroll_input_additions
  (hr_employee_id, razorpay_employee_id, period_month, label, amount, addition_type, taxable, source, source_revision_id)
VALUES
  ('ceee0919-3dff-427b-8d6c-26fb949432f1', '56', '2026-08-01',
   'CTC change arrears (eff 2026-08-20) - 12 days at revised CTC',
   1161, 1, true, 'ctc_transition_adjustment', 'e07b26ea-ded3-4552-8c3a-174f9fb0a9b4')
ON CONFLICT (hr_employee_id, period_month, source_revision_id)
  WHERE source_revision_id IS NOT NULL DO NOTHING;

-- LOP restated: 3 chargeable days (4 absences less 1 casual leave) on the
-- blended August base 11161/31.
UPDATE public.hr_payroll_input_deductions
   SET amount = 1080,
       lop_days = 3,
       label = 'Loss of Pay - Attendance - 3 days (4 days absence, 1 day offset by casual leave)',
       deduct_from = 'net',
       pushed_at = NULL,
       push_response = NULL,
       readback_verified_at = NULL,
       readback_diff = NULL,
       updated_at = now()
 WHERE id = '2fadb421-2f16-4ac3-bee4-39fd1a9c13d0';
