-- Create wallets table to manage different USDT wallets
CREATE TABLE public.wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_name TEXT NOT NULL,
  wallet_address TEXT UNIQUE NOT NULL,
  wallet_type TEXT NOT NULL DEFAULT 'USDT',
  current_balance NUMERIC NOT NULL DEFAULT 0,
  total_received NUMERIC NOT NULL DEFAULT 0,
  total_sent NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Create policy for wallets
CREATE POLICY "Allow all operations on wallets" 
ON public.wallets 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add wallet_id to sales_orders and remove platform dependency
ALTER TABLE public.sales_orders 
ADD COLUMN wallet_id UUID REFERENCES public.wallets(id),
ADD COLUMN usdt_amount NUMERIC DEFAULT 0;

-- Create wallet transactions table for tracking all wallet movements
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  transaction_type TEXT NOT NULL, -- 'DEBIT', 'CREDIT', 'TRANSFER_IN', 'TRANSFER_OUT'
  amount NUMERIC NOT NULL,
  reference_type TEXT, -- 'SALES_ORDER', 'MANUAL_ADJUSTMENT', 'TRANSFER'
  reference_id UUID, -- ID of the referenced record
  description TEXT,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Create policy for wallet_transactions
CREATE POLICY "Allow all operations on wallet_transactions" 
ON public.wallet_transactions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add USDT as a product in the products table if it doesn't exist
INSERT INTO public.products (
  name, 
  code, 
  unit_of_measurement, 
  cost_price, 
  selling_price, 
  current_stock_quantity
) VALUES (
  'USDT (Tether)', 
  'USDT', 
  'TOKENS', 
  1.00, 
  1.00, 
  0
) ON CONFLICT (code) DO NOTHING;

-- Create function to update wallet balance
CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
      UPDATE public.wallets 
      SET current_balance = current_balance + NEW.amount,
          total_received = total_received + NEW.amount,
          updated_at = now()
      WHERE id = NEW.wallet_id;
    ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
      UPDATE public.wallets 
      SET current_balance = current_balance - NEW.amount,
          total_sent = total_sent + NEW.amount,
          updated_at = now()
      WHERE id = NEW.wallet_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    IF OLD.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
      UPDATE public.wallets 
      SET current_balance = current_balance - OLD.amount,
          total_received = total_received - OLD.amount,
          updated_at = now()
      WHERE id = OLD.wallet_id;
    ELSIF OLD.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
      UPDATE public.wallets 
      SET current_balance = current_balance + OLD.amount,
          total_sent = total_sent - OLD.amount,
          updated_at = now()
      WHERE id = OLD.wallet_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for wallet balance updates
CREATE TRIGGER update_wallet_balance_trigger
  AFTER INSERT OR DELETE ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_balance();

-- Create function to sync wallet balances with USDT product stock
CREATE OR REPLACE FUNCTION public.sync_usdt_stock()
RETURNS VOID AS $$
DECLARE
  total_usdt_balance NUMERIC;
  usdt_product_id UUID;
BEGIN
  -- Calculate total USDT across all active wallets
  SELECT COALESCE(SUM(current_balance), 0) INTO total_usdt_balance
  FROM public.wallets 
  WHERE is_active = true AND wallet_type = 'USDT';
  
  -- Get USDT product ID
  SELECT id INTO usdt_product_id 
  FROM public.products 
  WHERE code = 'USDT';
  
  -- Update USDT product stock
  IF usdt_product_id IS NOT NULL THEN
    UPDATE public.products 
    SET current_stock_quantity = total_usdt_balance,
        updated_at = now()
    WHERE id = usdt_product_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to process sales order wallet deduction
CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(
  sales_order_id UUID,
  wallet_id UUID,
  usdt_amount NUMERIC
) RETURNS BOOLEAN AS $$
DECLARE
  current_wallet_balance NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  -- Check wallet balance
  SELECT current_balance INTO current_wallet_balance
  FROM public.wallets 
  WHERE id = wallet_id AND is_active = true;
  
  IF current_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_wallet_balance < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', current_wallet_balance, usdt_amount;
  END IF;
  
  -- Create wallet debit transaction
  INSERT INTO public.wallet_transactions (
    wallet_id,
    transaction_type,
    amount,
    reference_type,
    reference_id,
    description,
    balance_before,
    balance_after
  ) VALUES (
    wallet_id,
    'DEBIT',
    usdt_amount,
    'SALES_ORDER',
    sales_order_id,
    'USDT sold via sales order',
    current_wallet_balance,
    current_wallet_balance - usdt_amount
  ) RETURNING id INTO wallet_transaction_id;
  
  -- Sync USDT stock with wallet balances
  PERFORM public.sync_usdt_stock();
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically update updated_at
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();