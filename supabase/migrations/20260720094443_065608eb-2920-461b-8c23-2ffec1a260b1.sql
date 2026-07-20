ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS razorpay_reconciliation JSONB;

COMMENT ON COLUMN public.hr_employee_onboarding.razorpay_reconciliation IS
  'Snapshot of the RazorpayX-vs-ERP field diff produced during Stage 5 verification, including per-field operator overrides. Populated when the Verify with RazorpayX action succeeds; consumed to gate Finalize.';