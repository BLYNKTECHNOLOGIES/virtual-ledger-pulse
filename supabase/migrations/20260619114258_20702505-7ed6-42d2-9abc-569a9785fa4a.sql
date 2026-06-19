ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_status_check
  CHECK (status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'SUSPENDED'::text, 'PENDING'::text, 'REJECTED'::text]));