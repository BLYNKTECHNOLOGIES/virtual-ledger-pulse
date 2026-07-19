GRANT SELECT, INSERT, UPDATE ON public.hr_employee_salary_structure_assignments TO authenticated;
GRANT ALL ON public.hr_employee_salary_structure_assignments TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='hr_razorpay_payroll_freshness') THEN
    EXECUTE 'GRANT SELECT ON public.hr_razorpay_payroll_freshness TO authenticated';
    EXECUTE 'GRANT SELECT ON public.hr_razorpay_payroll_freshness TO service_role';
  END IF;
END $$;