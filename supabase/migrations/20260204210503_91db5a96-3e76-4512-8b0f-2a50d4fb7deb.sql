-- Add state column to client_onboarding_approvals table for storing client state during onboarding
ALTER TABLE public.client_onboarding_approvals ADD COLUMN IF NOT EXISTS client_state TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.client_onboarding_approvals.client_state IS 'Indian state or union territory where the client is located';