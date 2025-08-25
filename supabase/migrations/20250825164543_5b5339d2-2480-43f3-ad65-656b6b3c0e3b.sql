-- Create function to generate employee ID
CREATE OR REPLACE FUNCTION public.generate_employee_id(dept text, designation text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  dept_code text;
  year_suffix text;
  sequence_num integer;
  employee_id text;
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
      WHEN employee_id ~ ('^' || dept_code || year_suffix || '[0-9]+$') 
      THEN SUBSTRING(employee_id FROM '[0-9]+$')::integer 
      ELSE 0 
    END
  ), 0) + 1
  INTO sequence_num
  FROM employees
  WHERE employee_id LIKE dept_code || year_suffix || '%';
  
  -- Format employee ID: DEPTCODE + YEAR + SEQUENCE (3 digits)
  employee_id := dept_code || year_suffix || LPAD(sequence_num::text, 3, '0');
  
  RETURN employee_id;
END;
$$;