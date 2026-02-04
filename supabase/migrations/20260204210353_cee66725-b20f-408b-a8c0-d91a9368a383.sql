-- Add state column to clients table for storing client location state
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS state TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.clients.state IS 'Indian state or union territory where the client is located';