
-- Update the kyc_approval_requests status check constraint to include VIDEO_KYC
ALTER TABLE public.kyc_approval_requests 
DROP CONSTRAINT IF EXISTS kyc_approval_requests_status_check;

ALTER TABLE public.kyc_approval_requests 
ADD CONSTRAINT kyc_approval_requests_status_check 
CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'QUERIED', 'VIDEO_KYC'));
