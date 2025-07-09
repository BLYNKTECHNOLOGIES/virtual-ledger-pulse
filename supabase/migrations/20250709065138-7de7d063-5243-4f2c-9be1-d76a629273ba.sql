-- Remove employees from Technology, Sales, and Marketing departments
DELETE FROM employees WHERE department IN ('Technology', 'Sales', 'Marketing');