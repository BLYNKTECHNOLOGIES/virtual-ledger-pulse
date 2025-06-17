
-- Create payslips table to store employee salary information
CREATE TABLE public.payslips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  month_year TEXT NOT NULL, -- Format: YYYY-MM
  basic_salary NUMERIC NOT NULL DEFAULT 0,
  hra NUMERIC NOT NULL DEFAULT 0,
  conveyance_allowance NUMERIC NOT NULL DEFAULT 0,
  medical_allowance NUMERIC NOT NULL DEFAULT 0,
  other_allowances NUMERIC NOT NULL DEFAULT 0,
  gross_wages NUMERIC NOT NULL DEFAULT 0,
  total_earnings NUMERIC NOT NULL DEFAULT 0,
  epf NUMERIC NOT NULL DEFAULT 0,
  esi NUMERIC NOT NULL DEFAULT 0,
  professional_tax NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  net_salary NUMERIC NOT NULL DEFAULT 0,
  total_working_days INTEGER NOT NULL DEFAULT 30,
  leaves_taken INTEGER NOT NULL DEFAULT 0,
  lop_days INTEGER NOT NULL DEFAULT 0,
  paid_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'GENERATED'
);

-- Add unique constraint to prevent duplicate payslips for same employee and month
ALTER TABLE public.payslips 
ADD CONSTRAINT unique_employee_month UNIQUE (employee_id, month_year);

-- Add indexes for better performance
CREATE INDEX idx_payslips_employee_id ON public.payslips(employee_id);
CREATE INDEX idx_payslips_month_year ON public.payslips(month_year);
CREATE INDEX idx_payslips_status ON public.payslips(status);
