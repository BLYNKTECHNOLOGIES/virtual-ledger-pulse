-- Add PENDING_APPROVAL status to bank_accounts and update resolution flow
-- This enables the workflow: INACTIVE -> Under Investigation -> Resolved -> PENDING_APPROVAL -> ACTIVE

-- Add PENDING_APPROVAL to bank_accounts status enum if it doesn't exist
DO $$ 
BEGIN
    -- Add PENDING_APPROVAL status to the status check if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%bank_accounts_status%' 
        AND check_clause LIKE '%PENDING_APPROVAL%'
    ) THEN
        -- Drop existing constraint if exists
        ALTER TABLE bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_status_check;
        
        -- Add new constraint with PENDING_APPROVAL
        ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_status_check 
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL'));
    END IF;
END $$;