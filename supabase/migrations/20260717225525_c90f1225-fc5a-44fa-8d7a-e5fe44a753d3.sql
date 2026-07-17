
-- Employees can view their own HR documents
CREATE POLICY "Employees can view own documents"
ON public.hr_employee_documents FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
);

-- Employees can view own salary revisions
CREATE POLICY "Employees can view own salary revisions"
ON public.hr_salary_revisions FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
);

-- Employees can view own deposits
CREATE POLICY "Employees can view own deposits"
ON public.hr_employee_deposits FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
);

-- Employees can view own loans and repayments
CREATE POLICY "Employees can view own loans"
ON public.hr_loans FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
);

CREATE POLICY "Employees can view own loan repayments"
ON public.hr_loan_repayments FOR SELECT
USING (
  loan_id IN (
    SELECT id FROM public.hr_loans
    WHERE employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
  )
);

-- Employees can view own compoff credits
CREATE POLICY "Employees can view own compoff credits"
ON public.hr_compoff_credits FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
);

-- Employees can view own holidays list (already usually public but be explicit)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hr_holidays' AND policyname='Employees can view holidays') THEN
    EXECUTE 'CREATE POLICY "Employees can view holidays" ON public.hr_holidays FOR SELECT USING (true)';
  END IF;
END $$;
