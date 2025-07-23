-- Add COMPLETED status to KYC approval requests if not exists
DO $$
BEGIN
    -- Check if the status constraint exists and if COMPLETED is allowed
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'kyc_approval_requests' 
        AND column_name = 'status'
    ) THEN
        -- No constraint exists, so COMPLETED should work
        RAISE NOTICE 'No status constraint found on kyc_approval_requests';
    ELSE
        -- There might be a constraint, let's try to modify it
        ALTER TABLE kyc_approval_requests 
        DROP CONSTRAINT IF EXISTS kyc_approval_requests_status_check;
        
        ALTER TABLE kyc_approval_requests 
        ADD CONSTRAINT kyc_approval_requests_status_check 
        CHECK (status IN ('PENDING', 'QUERIED', 'VIDEO_KYC', 'APPROVED', 'REJECTED', 'COMPLETED'));
    END IF;
END
$$;