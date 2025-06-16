
-- Create tables for Stock Management
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  unit_of_measurement TEXT NOT NULL,
  current_stock_quantity INTEGER NOT NULL DEFAULT 0,
  cost_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN', 'OUT', 'ADJUSTMENT')),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  reference_number TEXT,
  supplier_customer_name TEXT,
  transaction_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tables for Accounting
CREATE TABLE public.ledger_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSETS', 'LIABILITIES', 'INCOME', 'EXPENSES')),
  account_code TEXT UNIQUE,
  opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_number TEXT UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  total_amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.journal_entry_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID REFERENCES public.journal_entries(id) NOT NULL,
  ledger_account_id UUID REFERENCES public.ledger_accounts(id) NOT NULL,
  debit_amount DECIMAL(10,2) DEFAULT 0,
  credit_amount DECIMAL(10,2) DEFAULT 0,
  description TEXT
);

-- Create tables for enhanced HRMS
CREATE TABLE public.job_postings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  description TEXT,
  qualifications TEXT,
  experience_required TEXT,
  location TEXT,
  salary_range_min DECIMAL(10,2),
  salary_range_max DECIMAL(10,2),
  job_type TEXT NOT NULL CHECK (job_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'ON_HOLD')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.job_applicants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_posting_id UUID REFERENCES public.job_postings(id) NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  resume_url TEXT,
  status TEXT NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'OFFERED', 'HIRED', 'REJECTED')),
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  department TEXT NOT NULL,
  designation TEXT NOT NULL,
  salary DECIMAL(10,2) NOT NULL,
  shift TEXT,
  date_of_joining DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'RESIGNED', 'TERMINATED')),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tables for enhanced Sales Orders
CREATE TABLE public.sales_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PARTIAL', 'COMPLETED', 'FAILED')),
  order_date DATE NOT NULL,
  delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tables for enhanced Clients
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_onboarding DATE NOT NULL,
  risk_appetite TEXT NOT NULL DEFAULT 'HIGH' CHECK (risk_appetite IN ('LOW', 'MEDIUM', 'HIGH')),
  client_type TEXT NOT NULL CHECK (client_type IN ('RETAIL', 'INSTITUTIONAL')),
  assigned_operator TEXT,
  buying_purpose TEXT,
  first_order_value DECIMAL(10,2),
  monthly_limit DECIMAL(10,2),
  current_month_used DECIMAL(10,2) DEFAULT 0,
  kyc_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  client_value_score DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tables for Bank Accounts (enhanced BAMS)
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_number TEXT UNIQUE NOT NULL,
  bank_name TEXT NOT NULL,
  branch TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('SAVINGS', 'CURRENT', 'FIXED_DEPOSIT')),
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'FROZEN', 'CLOSED')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (you can modify these later for authentication)
CREATE POLICY "Allow all operations" ON public.products FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.stock_transactions FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.ledger_accounts FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.journal_entries FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.journal_entry_lines FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.job_postings FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.job_applicants FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.employees FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.sales_orders FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.clients FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON public.bank_accounts FOR ALL USING (true);
