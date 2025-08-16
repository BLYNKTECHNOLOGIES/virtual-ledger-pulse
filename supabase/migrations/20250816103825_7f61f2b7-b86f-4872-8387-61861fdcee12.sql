-- Fix the job_applicants status constraint to include NOT_INTERESTED
ALTER TABLE job_applicants 
DROP CONSTRAINT IF EXISTS job_applicants_status_check;

-- Add the updated constraint with NOT_INTERESTED included
ALTER TABLE job_applicants 
ADD CONSTRAINT job_applicants_status_check 
CHECK (status IN ('APPLIED', 'CONTACTED', 'INTERVIEW', 'SELECTED', 'REJECTED', 'ONBOARDED', 'NOT_INTERESTED'));