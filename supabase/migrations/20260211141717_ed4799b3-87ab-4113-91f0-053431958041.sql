-- terminal_wallet_links: allow app access without Supabase Auth (anon)

-- Ensure RLS is enabled (it already is, but keep this idempotent)
ALTER TABLE public.terminal_wallet_links ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies (idempotent)
DROP POLICY IF EXISTS "Authenticated users can view terminal wallet links" ON public.terminal_wallet_links;
DROP POLICY IF EXISTS "Authenticated users can manage terminal wallet links" ON public.terminal_wallet_links;

-- Allow SELECT for all roles (anon + authenticated)
CREATE POLICY "App can view terminal wallet links"
ON public.terminal_wallet_links
FOR SELECT
TO public
USING (true);

-- Allow INSERT/UPDATE/DELETE for all roles (anon + authenticated)
CREATE POLICY "App can manage terminal wallet links"
ON public.terminal_wallet_links
FOR ALL
TO public
USING (true)
WITH CHECK (true);
