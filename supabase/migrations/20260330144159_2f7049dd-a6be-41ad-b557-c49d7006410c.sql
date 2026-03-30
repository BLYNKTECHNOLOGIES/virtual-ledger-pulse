-- Backfill 2 rows where closed_by was set to 'Current User' (actor unrecoverable)
UPDATE public.closed_bank_accounts 
SET closed_by = 'system-backfill' 
WHERE closed_by = 'Current User';

-- Also fix any 'Current User' in account_investigations and bank_cases
UPDATE public.account_investigations SET assigned_to = 'system-backfill' WHERE assigned_to = 'Current User';
UPDATE public.bank_cases SET investigation_assigned_to = 'system-backfill' WHERE investigation_assigned_to = 'Current User';