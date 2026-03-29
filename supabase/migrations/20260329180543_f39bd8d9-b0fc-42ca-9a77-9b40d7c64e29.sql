-- Fix inconsistent work_type: 'office' should be 'On-site'
UPDATE hr_employee_work_info SET work_type = 'On-site' WHERE work_type = 'office';
UPDATE hr_attendance SET work_type = 'On-site' WHERE work_type = 'office';