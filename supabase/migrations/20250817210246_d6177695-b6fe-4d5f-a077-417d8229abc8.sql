-- Create pending settlements table
CREATE TABLE public.pending_settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_order_id UUID NOT NULL,
  order_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  settlement_amount NUMERIC NOT NULL DEFAULT 0,
  order_date DATE NOT NULL,
  payment_method_id UUID,
  payment_gateway_id UUID,
  expected_settlement_date DATE,
  actual_settlement_date DATE,
  mdr_amount NUMERIC DEFAULT 0,
  mdr_rate NUMERIC DEFAULT 0,
  settlement_cycle TEXT,
  settlement_days INTEGER,
  bank_account_id UUID,
  status TEXT NOT NULL DEFAULT 'PENDING',
  settlement_batch_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  settled_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  settled_by UUID
);

-- Enable Row Level Security
ALTER TABLE public.pending_settlements ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations on pending_settlements" 
ON public.pending_settlements 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_pending_settlements_sales_order_id ON public.pending_settlements(sales_order_id);
CREATE INDEX idx_pending_settlements_status ON public.pending_settlements(status);
CREATE INDEX idx_pending_settlements_bank_account_id ON public.pending_settlements(bank_account_id);
CREATE INDEX idx_pending_settlements_settlement_date ON public.pending_settlements(expected_settlement_date);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_pending_settlements_updated_at
BEFORE UPDATE ON public.pending_settlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to automatically create pending settlement when sales order is completed
CREATE OR REPLACE FUNCTION public.create_pending_settlement()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create pending settlement for payment gateway orders that are completed
  IF NEW.payment_status = 'COMPLETED' AND NEW.settlement_status = 'PENDING' 
     AND NEW.sales_payment_method_id IS NOT NULL THEN
    
    -- Get payment method details
    INSERT INTO public.pending_settlements (
      sales_order_id,
      order_number,
      client_name,
      total_amount,
      settlement_amount,
      order_date,
      payment_method_id,
      status,
      created_at
    ) VALUES (
      NEW.id,
      NEW.order_number,
      NEW.client_name,
      NEW.total_amount,
      NEW.total_amount, -- Default settlement amount same as total
      NEW.order_date,
      NEW.sales_payment_method_id,
      'PENDING',
      now()
    )
    ON CONFLICT (sales_order_id) DO NOTHING; -- Prevent duplicates
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create pending settlements
CREATE TRIGGER create_pending_settlement_trigger
AFTER INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.create_pending_settlement();

-- Add unique constraint to prevent duplicate pending settlements for same sales order
ALTER TABLE public.pending_settlements 
ADD CONSTRAINT unique_sales_order_pending_settlement 
UNIQUE (sales_order_id);