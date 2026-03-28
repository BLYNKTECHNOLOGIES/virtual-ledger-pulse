-- Migration: Convert employee_id from TEXT (badge_id) to UUID (hr_employees.id)
-- in hr_attendance_punches, hr_attendance_daily, and hr_attendance_punches_archive

-- STEP 1: Add new UUID columns
ALTER TABLE hr_attendance_punches ADD COLUMN employee_uuid uuid;
ALTER TABLE hr_attendance_daily ADD COLUMN employee_uuid uuid;
ALTER TABLE hr_attendance_punches_archive ADD COLUMN employee_uuid uuid;

-- STEP 2: Backfill UUID from hr_employees using badge_id
UPDATE hr_attendance_punches p
SET employee_uuid = e.id
FROM hr_employees e
WHERE e.badge_id = p.employee_id;

UPDATE hr_attendance_daily d
SET employee_uuid = e.id
FROM hr_employees e
WHERE e.badge_id = d.employee_id;

UPDATE hr_attendance_punches_archive a
SET employee_uuid = e.id
FROM hr_employees e
WHERE e.badge_id = a.employee_id;

-- STEP 3: Delete orphaned rows (badge_id with no matching employee)
DELETE FROM hr_attendance_punches WHERE employee_uuid IS NULL;
DELETE FROM hr_attendance_daily WHERE employee_uuid IS NULL;
DELETE FROM hr_attendance_punches_archive WHERE employee_uuid IS NULL;

-- STEP 4: Drop old constraints and indexes on employee_id
DROP INDEX IF EXISTS idx_punches_employee_date;
DROP INDEX IF EXISTS idx_daily_emp_date;
ALTER TABLE hr_attendance_daily DROP CONSTRAINT IF EXISTS hr_attendance_daily_employee_id_attendance_date_key;

-- STEP 5: Drop old employee_id column, rename employee_uuid to employee_id
ALTER TABLE hr_attendance_punches DROP COLUMN employee_id;
ALTER TABLE hr_attendance_punches RENAME COLUMN employee_uuid TO employee_id;
ALTER TABLE hr_attendance_punches ALTER COLUMN employee_id SET NOT NULL;

ALTER TABLE hr_attendance_daily DROP COLUMN employee_id;
ALTER TABLE hr_attendance_daily RENAME COLUMN employee_uuid TO employee_id;
ALTER TABLE hr_attendance_daily ALTER COLUMN employee_id SET NOT NULL;

ALTER TABLE hr_attendance_punches_archive DROP COLUMN employee_id;
ALTER TABLE hr_attendance_punches_archive RENAME COLUMN employee_uuid TO employee_id;

-- STEP 6: Add FK constraints
ALTER TABLE hr_attendance_punches 
  ADD CONSTRAINT hr_attendance_punches_employee_id_fkey 
  FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

ALTER TABLE hr_attendance_daily 
  ADD CONSTRAINT hr_attendance_daily_employee_id_fkey 
  FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

-- STEP 7: Recreate indexes and unique constraint with UUID
CREATE INDEX idx_punches_employee_date ON hr_attendance_punches(employee_id, punch_time DESC);
CREATE UNIQUE INDEX hr_attendance_daily_employee_id_attendance_date_key 
  ON hr_attendance_daily(employee_id, attendance_date);
CREATE INDEX idx_daily_emp_date ON hr_attendance_daily(employee_id, attendance_date DESC);