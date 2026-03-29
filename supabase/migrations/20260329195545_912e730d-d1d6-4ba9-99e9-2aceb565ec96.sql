
-- Add shift_reconciliation_create to the app_permission enum
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'shift_reconciliation_create';
