CREATE POLICY "authenticated_read_exchange_account_labels"
ON public.terminal_exchange_accounts
FOR SELECT
TO authenticated
USING (true);