-- First, delete related records that reference employees from Technology, Sales, and Marketing departments
DELETE FROM payslips WHERE employee_id IN (
  SELECT id FROM employees WHERE department IN ('Technology', 'Sales', 'Marketing')
);

DELETE FROM performance_reviews WHERE employee_id IN (
  SELECT id FROM employees WHERE department IN ('Technology', 'Sales', 'Marketing')
);

DELETE FROM employee_offboarding WHERE employee_id IN (
  SELECT id FROM employees WHERE department IN ('Technology', 'Sales', 'Marketing')
);

DELETE FROM payers WHERE employee_id IN (
  SELECT id FROM employees WHERE department IN ('Technology', 'Sales', 'Marketing')
);

-- Now delete the employees from Technology, Sales, and Marketing departments
DELETE FROM employees WHERE department IN ('Technology', 'Sales', 'Marketing');