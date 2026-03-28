-- H3: Add LOP tracking fields to hr_payslips
ALTER TABLE hr_payslips 
  ADD COLUMN IF NOT EXISTS lop_days numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lop_deduction numeric DEFAULT 0;

-- H4: Loan/Advance management tables
CREATE TABLE IF NOT EXISTS hr_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  loan_type text NOT NULL DEFAULT 'salary_advance',
  amount numeric NOT NULL,
  outstanding_balance numeric NOT NULL,
  emi_amount numeric NOT NULL,
  tenure_months int NOT NULL DEFAULT 1,
  interest_rate numeric DEFAULT 0,
  disbursement_date date NOT NULL DEFAULT CURRENT_DATE,
  start_emi_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES hr_loans(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  repayment_date date NOT NULL DEFAULT CURRENT_DATE,
  repayment_type text NOT NULL DEFAULT 'emi',
  payroll_run_id uuid REFERENCES hr_payroll_runs(id),
  balance_after numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- H6: Add review step to payroll workflow
ALTER TABLE hr_payroll_runs
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

-- Enable RLS
ALTER TABLE hr_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_loan_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage hr_loans" ON hr_loans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage hr_loan_repayments" ON hr_loan_repayments FOR ALL TO authenticated USING (true) WITH CHECK (true);
