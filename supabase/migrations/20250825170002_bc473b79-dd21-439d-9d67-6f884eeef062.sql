-- Fix the generate_employee_id function - ambiguous column reference
CREATE OR REPLACE FUNCTION public.generate_employee_id(dept text, designation text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  dept_code text;
  year_suffix text;
  sequence_num integer;
  new_employee_id text;
BEGIN
  -- Get department code
  dept_code := CASE 
    WHEN dept = 'Technology' THEN 'TECH'
    WHEN dept = 'Sales' THEN 'SALES'
    WHEN dept = 'Marketing' THEN 'MKT'
    WHEN dept = 'Human Resources' OR dept = 'HR' THEN 'HR'
    WHEN dept = 'Finance' THEN 'FIN'
    WHEN dept = 'Operations' THEN 'OPS'
    WHEN dept = 'Compliance' THEN 'COMP'
    WHEN dept = 'Legal' THEN 'LEGAL'
    ELSE 'EMP'
  END;
  
  -- Get current year last two digits
  year_suffix := EXTRACT(YEAR FROM CURRENT_DATE)::text;
  year_suffix := RIGHT(year_suffix, 2);
  
  -- Get next sequence number for this department and year
  SELECT COALESCE(MAX(
    CASE 
      WHEN e.employee_id ~ ('^' || dept_code || year_suffix || '[0-9]+$') 
      THEN SUBSTRING(e.employee_id FROM '[0-9]+$')::integer 
      ELSE 0 
    END
  ), 0) + 1
  INTO sequence_num
  FROM employees e
  WHERE e.employee_id LIKE dept_code || year_suffix || '%';
  
  -- Format employee ID: DEPTCODE + YEAR + SEQUENCE (3 digits)
  new_employee_id := dept_code || year_suffix || LPAD(sequence_num::text, 3, '0');
  
  RETURN new_employee_id;
END;
$function$;

-- Check what employee_type values are allowed
SELECT * FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%employee_type%';

-- If the constraint exists, let's see what values are allowed
-- and update it to include common employee types
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_type_check;

-- Add a new constraint that allows common employee types
ALTER TABLE employees ADD CONSTRAINT employees_employee_type_check 
CHECK (employee_type IN ('Full-time', 'Part-time', 'Contract', 'Intern', 'Consultant', 'Temporary'));

-- Also ensure the columns that are being inserted have proper defaults or handle nulls
ALTER TABLE employees ALTER COLUMN job_contract_signed SET DEFAULT false;