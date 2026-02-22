
-- Create hr_employee_deposits table
CREATE TABLE public.hr_employee_deposits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  total_deposit_amount NUMERIC NOT NULL DEFAULT 0,
  collected_amount NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  deduction_mode TEXT NOT NULL DEFAULT 'fixed_installment' CHECK (deduction_mode IN ('one_time', 'percentage', 'fixed_installment')),
  deduction_value NUMERIC NOT NULL DEFAULT 0,
  deduction_start_month TEXT,
  is_fully_collected BOOLEAN NOT NULL DEFAULT false,
  is_settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  settlement_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create hr_deposit_transactions table
CREATE TABLE public.hr_deposit_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  deposit_id UUID NOT NULL REFERENCES public.hr_employee_deposits(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('collection', 'penalty_deduction', 'replenishment', 'ff_refund')),
  amount NUMERIC NOT NULL DEFAULT 0,
  balance_after NUMERIC NOT NULL DEFAULT 0,
  reference_id TEXT,
  description TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payroll_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add deduct_from_deposit column to hr_penalties
ALTER TABLE public.hr_penalties ADD COLUMN IF NOT EXISTS deduct_from_deposit BOOLEAN NOT NULL DEFAULT false;

-- Enable RLS
ALTER TABLE public.hr_employee_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_deposit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow all for authenticated users)
CREATE POLICY "Allow all for authenticated users" ON public.hr_employee_deposits FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON public.hr_deposit_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_hr_employee_deposits_employee_id ON public.hr_employee_deposits(employee_id);
CREATE INDEX idx_hr_deposit_transactions_deposit_id ON public.hr_deposit_transactions(deposit_id);
CREATE INDEX idx_hr_deposit_transactions_employee_id ON public.hr_deposit_transactions(employee_id);
