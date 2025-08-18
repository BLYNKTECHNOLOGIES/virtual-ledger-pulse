-- Enable RLS and create policies for stock_transactions table
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- Policy for system/triggers to manage stock transactions
CREATE POLICY "System can manage stock transactions" 
ON public.stock_transactions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Policy for users to read stock transactions
CREATE POLICY "Users can view stock transactions" 
ON public.stock_transactions 
FOR SELECT 
USING (true);