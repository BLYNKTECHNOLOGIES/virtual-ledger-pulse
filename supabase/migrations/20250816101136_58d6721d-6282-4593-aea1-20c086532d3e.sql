-- Add investigation status to bank_cases table
ALTER TABLE bank_cases 
ADD COLUMN investigation_status text DEFAULT 'NOT_STARTED';

-- Add investigation started date
ALTER TABLE bank_cases 
ADD COLUMN investigation_started_at timestamp with time zone;

-- Add investigation assigned to
ALTER TABLE bank_cases 
ADD COLUMN investigation_assigned_to text;