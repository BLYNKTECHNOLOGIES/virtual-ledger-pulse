
-- Add new permission enum values (must be done first, separate from usage)
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_payer_view';
ALTER TYPE public.terminal_permission ADD VALUE IF NOT EXISTS 'terminal_payer_manage';
