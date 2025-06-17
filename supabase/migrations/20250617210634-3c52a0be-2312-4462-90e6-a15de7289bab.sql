
-- Create TDS table for tracking TDS deductions
CREATE TABLE public.tds_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  pan_number text NOT NULL,
  total_amount numeric NOT NULL,
  tds_rate numeric NOT NULL DEFAULT 1.0, -- TDS rate in percentage
  tds_amount numeric NOT NULL,
  net_payable_amount numeric NOT NULL,
  deduction_date date NOT NULL DEFAULT CURRENT_DATE,
  financial_year text NOT NULL,
  tds_certificate_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add TDS related fields to purchase_orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN tds_applied boolean DEFAULT false,
ADD COLUMN pan_number text,
ADD COLUMN tds_amount numeric DEFAULT 0,
ADD COLUMN net_payable_amount numeric,
ADD COLUMN tax_amount numeric DEFAULT 0;

-- Add RLS policies for TDS records
ALTER TABLE public.tds_records ENABLE ROW LEVEL SECURITY;

-- Create policy for TDS records (allow all operations for now)
CREATE POLICY "Allow all operations on TDS records" ON public.tds_records
FOR ALL USING (true) WITH CHECK (true);
