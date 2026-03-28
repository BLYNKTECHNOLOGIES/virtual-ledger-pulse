-- BUG #2: Update employer contribution component types
UPDATE hr_salary_components SET component_type = 'employer_contribution' WHERE code IN ('PFC', 'ESIC');