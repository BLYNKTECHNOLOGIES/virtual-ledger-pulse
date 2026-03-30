-- P22-DATA-01: Convert bank_cases user columns from TEXT to UUID with FK

-- Step 1: NULL out non-UUID values (found: 'system-backfill')
UPDATE bank_cases SET assigned_to = NULL WHERE assigned_to IS NOT NULL AND assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE bank_cases SET created_by = NULL WHERE created_by IS NOT NULL AND created_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE bank_cases SET resolved_by = NULL WHERE resolved_by IS NOT NULL AND resolved_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE bank_cases SET investigation_assigned_to = NULL WHERE investigation_assigned_to IS NOT NULL AND investigation_assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Step 2: Alter columns from TEXT to UUID
ALTER TABLE bank_cases ALTER COLUMN assigned_to TYPE uuid USING assigned_to::uuid;
ALTER TABLE bank_cases ALTER COLUMN created_by TYPE uuid USING created_by::uuid;
ALTER TABLE bank_cases ALTER COLUMN resolved_by TYPE uuid USING resolved_by::uuid;
ALTER TABLE bank_cases ALTER COLUMN investigation_assigned_to TYPE uuid USING investigation_assigned_to::uuid;

-- Step 3: Add FK references to auth.users with ON DELETE SET NULL
ALTER TABLE bank_cases ADD CONSTRAINT bank_cases_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE bank_cases ADD CONSTRAINT bank_cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE bank_cases ADD CONSTRAINT bank_cases_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE bank_cases ADD CONSTRAINT bank_cases_investigation_assigned_to_fkey FOREIGN KEY (investigation_assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;