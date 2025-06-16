
-- First, let's see what values are currently allowed for risk_appetite
-- and update the constraint to allow the values we're using in the application

-- Drop the existing constraint
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_risk_appetite_check;

-- Add the correct constraint with the values we're actually using
ALTER TABLE public.clients ADD CONSTRAINT clients_risk_appetite_check 
CHECK (risk_appetite IN ('LOW', 'MEDIUM', 'HIGH', 'NONE'));

-- Also make sure the default value is properly set
ALTER TABLE public.clients ALTER COLUMN risk_appetite SET DEFAULT 'HIGH';
