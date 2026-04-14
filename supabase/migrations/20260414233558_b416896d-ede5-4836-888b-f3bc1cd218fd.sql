-- Drop the dangerous anon read policy that exposes all user data to unauthenticated requests
DROP POLICY IF EXISTS "anon_read_users_for_login" ON public.users;