-- BUG-V6-07: Drop duplicate leave clash trigger that overwrites correct values with 0
DROP TRIGGER IF EXISTS trg_update_leave_clashes ON hr_leave_requests;

-- CLASH-V6-01: Rename balance trigger so it fires AFTER validation (alphabetically)
ALTER TRIGGER trg_leave_balance_on_status_change 
  ON hr_leave_requests RENAME TO trg_z_leave_balance_on_status_change;