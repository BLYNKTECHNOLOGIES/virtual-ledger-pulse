
-- Create payers table
CREATE TABLE public.payers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  safe_funds BOOLEAN NOT NULL DEFAULT false,
  payer_type TEXT NOT NULL CHECK (payer_type IN ('UPI', 'Bank Transfer')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payer_payment_methods junction table (many-to-many relationship)
CREATE TABLE public.payer_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payer_id UUID NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  purchase_payment_method_id UUID NOT NULL REFERENCES purchase_payment_methods(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(payer_id, purchase_payment_method_id)
);

-- Add indexes for better performance
CREATE INDEX idx_payers_employee_id ON public.payers(employee_id);
CREATE INDEX idx_payers_status ON public.payers(status);
CREATE INDEX idx_payer_payment_methods_payer_id ON public.payer_payment_methods(payer_id);

-- Add trigger to update updated_at column
CREATE TRIGGER update_payers_updated_at
  BEFORE UPDATE ON public.payers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on the tables (optional, can be added later if needed)
ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_payment_methods ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations for now (can be restricted later)
CREATE POLICY "Allow all operations on payers" ON public.payers FOR ALL USING (true);
CREATE POLICY "Allow all operations on payer_payment_methods" ON public.payer_payment_methods FOR ALL USING (true);
