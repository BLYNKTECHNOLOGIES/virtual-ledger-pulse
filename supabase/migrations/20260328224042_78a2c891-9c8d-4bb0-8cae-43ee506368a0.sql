
-- CLEANUP-V4-02 retry: Drop duplicate INDEX (not constraint) on hr_attendance
DROP INDEX IF EXISTS hr_attendance_employee_date_unique;

-- P2-9: Drop legacy validate_leave_balance_on_approve function (unused, conflicts with fn_validate_leave_balance)
DROP FUNCTION IF EXISTS validate_leave_balance_on_approve();
