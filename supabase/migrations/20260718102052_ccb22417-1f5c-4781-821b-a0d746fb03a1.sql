CREATE OR REPLACE VIEW public.hr_employee_completeness AS
SELECT e.id AS employee_id,
    (EXISTS ( SELECT 1
           FROM hr_employee_bank_details b
          WHERE b.employee_id = e.id AND b.account_number IS NOT NULL AND b.account_number <> ''::text)) AS has_bank,
    (
      EXISTS ( SELECT 1 FROM hr_employee_salary_structures s WHERE s.employee_id = e.id)
      OR COALESCE(o.ctc, 0) > 0
    ) AS has_salary,
    (EXISTS ( SELECT 1
           FROM hr_employee_work_info w
          WHERE w.employee_id = e.id AND w.joining_date IS NOT NULL)
     OR o.date_of_joining IS NOT NULL) AS has_doj,
    (EXISTS ( SELECT 1
           FROM hr_employee_work_info w
          WHERE w.employee_id = e.id AND (w.department_id IS NOT NULL OR w.job_position_id IS NOT NULL))
     OR o.department_id IS NOT NULL OR o.position_id IS NOT NULL) AS has_designation
   FROM hr_employees e
     JOIN hr_employee_onboarding o ON o.employee_id = e.id
  WHERE COALESCE(o.status, ''::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text]);