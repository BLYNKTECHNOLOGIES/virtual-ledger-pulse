-- Enable RLS on wallets table and create policy
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations on wallets (since this is for internal ERP use)
CREATE POLICY "Allow all operations on wallets" 
ON public.wallets 
FOR ALL 
USING (true) 
WITH CHECK (true);