-- First, delete orphaned investigation_approvals that reference non-existent bank_cases
DELETE FROM investigation_approvals
WHERE investigation_id NOT IN (SELECT id FROM bank_cases);

-- Now add the foreign key constraint
ALTER TABLE investigation_approvals
ADD CONSTRAINT fk_investigation_approvals_bank_cases
FOREIGN KEY (investigation_id)
REFERENCES bank_cases(id)
ON DELETE CASCADE;