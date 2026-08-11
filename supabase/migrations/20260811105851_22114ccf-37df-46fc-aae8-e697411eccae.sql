-- Self-read access on the raw payroll records for the signed-in employee
DROP POLICY IF EXISTS "Employees can view their own payslip records" ON public.hr_razorpay_payslip_records;
CREATE POLICY "Employees can view their own payslip records"
ON public.hr_razorpay_payslip_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.hr_employees e
    WHERE e.id = hr_razorpay_payslip_records.hr_employee_id
      AND e.user_id = auth.uid()
  )
  OR public.hr_is_hr_staff(auth.uid())
);

-- Canonical ESS reader: returns only the caller's own payslips
CREATE OR REPLACE FUNCTION public.hr_my_payslips()
RETURNS SETOF public.hr_payslips_v
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT v.*
  FROM public.hr_payslips_v v
  WHERE v.employee_id IN (
    SELECT e2.id
    FROM public.hr_employees e2
    WHERE e2.user_id = auth.uid()
       OR (
         e2.badge_id IS NOT NULL
         AND e2.badge_id IN (
           SELECT e3.badge_id FROM public.hr_employees e3 WHERE e3.user_id = auth.uid()
         )
       )
  )
  ORDER BY v.period_month DESC
$$;

REVOKE ALL ON FUNCTION public.hr_my_payslips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_my_payslips() TO authenticated;
GRANT SELECT ON public.hr_payslips_v TO authenticated;