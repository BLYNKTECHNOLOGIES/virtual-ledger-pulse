
-- CLEANUP-V4-01: Drop duplicate constraint on hr_attendance_daily
ALTER TABLE hr_attendance_daily DROP CONSTRAINT IF EXISTS uq_attendance_daily_employee_date;

-- CLEANUP-V4-02: Drop duplicate constraint on hr_attendance
ALTER TABLE hr_attendance DROP CONSTRAINT IF EXISTS hr_attendance_employee_date_unique;

-- CLEANUP-V4-03: Fix "MANAGMENT" typo
UPDATE hr_shifts SET name = 'MANAGEMENT' WHERE id = '2fed3bf1-8aed-4304-8743-4fd1f1dfa40b' AND name = 'MANAGMENT';
