
-- Phase 1: Core Employee Management Tables

-- Employee Tags
CREATE TABLE public.hr_employee_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  color TEXT DEFAULT '#E8604C',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_employee_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_employee_tags" ON public.hr_employee_tags FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Main Employees Table
CREATE TABLE public.hr_employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  badge_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  country TEXT DEFAULT 'India',
  state TEXT,
  city TEXT,
  zip TEXT,
  dob DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  qualification TEXT,
  experience TEXT,
  marital_status TEXT CHECK (marital_status IN ('single', 'married', 'divorced')),
  children INT DEFAULT 0,
  emergency_contact TEXT,
  emergency_contact_name TEXT,
  emergency_contact_relation TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  profile_image_url TEXT,
  additional_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_employees" ON public.hr_employees FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Employee Work Information
CREATE TABLE public.hr_employee_work_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id),
  job_position_id UUID REFERENCES public.positions(id),
  job_role TEXT,
  reporting_manager_id UUID REFERENCES public.hr_employees(id),
  shift_id UUID,
  work_type TEXT DEFAULT 'office',
  employee_type TEXT DEFAULT 'full_time',
  location TEXT,
  company_name TEXT,
  work_email TEXT,
  work_phone TEXT,
  joining_date DATE,
  contract_end_date DATE,
  basic_salary NUMERIC(12,2) DEFAULT 0,
  salary_per_hour NUMERIC(8,2) DEFAULT 0,
  experience_years INT DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  additional_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_employee_work_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_employee_work_info" ON public.hr_employee_work_info FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Employee Bank Details
CREATE TABLE public.hr_employee_bank_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  bank_name TEXT,
  account_number TEXT,
  branch TEXT,
  address TEXT,
  country TEXT DEFAULT 'India',
  state TEXT,
  city TEXT,
  bank_code_1 TEXT, -- IFSC
  bank_code_2 TEXT, -- SWIFT etc
  additional_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, account_number)
);
ALTER TABLE public.hr_employee_bank_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_employee_bank_details" ON public.hr_employee_bank_details FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Employee Notes
CREATE TABLE public.hr_employee_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  updated_by UUID REFERENCES public.hr_employees(id),
  note_files TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_employee_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_employee_notes" ON public.hr_employee_notes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Bonus Points
CREATE TABLE public.hr_bonus_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  points INT NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_bonus_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_bonus_points" ON public.hr_bonus_points FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Policies
CREATE TABLE public.hr_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  is_visible_to_all BOOLEAN DEFAULT true,
  attachments TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_policies" ON public.hr_policies FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Disciplinary Actions
CREATE TABLE public.hr_disciplinary_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_ids UUID[] NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL CHECK (action_type IN ('warning', 'suspension', 'dismissal')),
  description TEXT,
  unit_in TEXT DEFAULT 'days',
  duration INT DEFAULT 0,
  start_date DATE,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_disciplinary_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_disciplinary_actions" ON public.hr_disciplinary_actions FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Notifications
CREATE TABLE public.hr_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  employee_id UUID REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_notifications" ON public.hr_notifications FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Updated_at trigger for tables that need it
CREATE OR REPLACE FUNCTION public.hr_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER hr_employees_updated_at BEFORE UPDATE ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.hr_update_updated_at();
CREATE TRIGGER hr_employee_work_info_updated_at BEFORE UPDATE ON public.hr_employee_work_info FOR EACH ROW EXECUTE FUNCTION public.hr_update_updated_at();
CREATE TRIGGER hr_employee_bank_details_updated_at BEFORE UPDATE ON public.hr_employee_bank_details FOR EACH ROW EXECUTE FUNCTION public.hr_update_updated_at();
CREATE TRIGGER hr_policies_updated_at BEFORE UPDATE ON public.hr_policies FOR EACH ROW EXECUTE FUNCTION public.hr_update_updated_at();
