
-- Onboarding Pipeline staging table
CREATE TABLE public.hr_employee_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.hr_candidates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  current_stage INT NOT NULL DEFAULT 1,

  -- Stage 1: Basic Details
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  gender TEXT,
  date_of_birth DATE,
  department_id UUID REFERENCES public.departments(id),
  position_id UUID REFERENCES public.positions(id),
  job_role TEXT,
  shift_id UUID,
  employee_type TEXT,

  -- Stage 2: Salary Configuration
  ctc NUMERIC,
  salary_template_id UUID,
  deposit_config JSONB,

  -- Stage 3: Documents
  documents JSONB DEFAULT '{}',
  document_email_sent_at TIMESTAMPTZ,
  document_mail_received_at DATE,
  document_collection_status TEXT DEFAULT 'pending',

  -- Stage 4: Offer & Policy
  offer_policy_status TEXT DEFAULT 'skipped',

  -- Stage 5: Finalization
  date_of_joining DATE,
  essl_badge_id TEXT,
  create_erp_account BOOLEAN DEFAULT false,
  erp_role_id TEXT,

  -- Audit
  stage_completions JSONB DEFAULT '{}',
  created_by UUID,
  employee_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log table
CREATE TABLE public.hr_onboarding_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES public.hr_employee_onboarding(id) ON DELETE CASCADE,
  stage INT,
  action TEXT NOT NULL,
  changed_fields JSONB,
  performed_by UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.hr_employee_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_onboarding_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage onboarding" ON public.hr_employee_onboarding
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage audit log" ON public.hr_onboarding_audit_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_hr_employee_onboarding_status ON public.hr_employee_onboarding(status);
CREATE INDEX idx_hr_onboarding_audit_log_onboarding_id ON public.hr_onboarding_audit_log(onboarding_id);
