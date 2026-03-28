-- ================================================
-- P4b: Resignation Workflow + Onboarding Checklist
-- ================================================

-- 1. Add resignation tracking columns to hr_employees
ALTER TABLE hr_employees 
  ADD COLUMN IF NOT EXISTS resignation_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notice_period_end_date DATE DEFAULT NULL;

-- Validation trigger for resignation_status
CREATE OR REPLACE FUNCTION fn_validate_resignation_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resignation_status IS NOT NULL AND NEW.resignation_status NOT IN (
    'notice_period', 'completed', 'withdrawn'
  ) THEN
    RAISE EXCEPTION 'Invalid resignation_status: %. Allowed: notice_period, completed, withdrawn', NEW.resignation_status;
  END IF;

  -- When resignation is completed, deactivate the employee
  IF NEW.resignation_status = 'completed' AND (OLD.resignation_status IS DISTINCT FROM 'completed') THEN
    NEW.is_active := false;
  END IF;

  -- When resignation is withdrawn, clear resignation fields
  IF NEW.resignation_status = 'withdrawn' AND (OLD.resignation_status IS DISTINCT FROM 'withdrawn') THEN
    NEW.resignation_date := NULL;
    NEW.notice_period_end_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_resignation_status ON hr_employees;
CREATE TRIGGER trg_validate_resignation_status
  BEFORE UPDATE ON hr_employees
  FOR EACH ROW
  WHEN (NEW.resignation_status IS DISTINCT FROM OLD.resignation_status)
  EXECUTE FUNCTION fn_validate_resignation_status();

-- 2. Resignation checklist template (editable by HR)
CREATE TABLE IF NOT EXISTS hr_resignation_checklist_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  sequence INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hr_resignation_checklist_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view resignation checklist template"
  ON hr_resignation_checklist_template FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage resignation checklist template"
  ON hr_resignation_checklist_template FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Per-employee resignation checklist
CREATE TABLE IF NOT EXISTS hr_resignation_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES hr_resignation_checklist_template(id) ON DELETE SET NULL,
  item_title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hr_resignation_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view resignation checklist"
  ON hr_resignation_checklist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage resignation checklist"
  ON hr_resignation_checklist FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Seed default resignation checklist template
INSERT INTO hr_resignation_checklist_template (item_title, category, sequence) VALUES
  ('Resignation letter collected', 'documentation', 1),
  ('Exit interview conducted', 'documentation', 2),
  ('Knowledge transfer completed', 'handover', 3),
  ('Project handover documentation', 'handover', 4),
  ('Company laptop returned', 'assets', 5),
  ('ID card / access badge returned', 'assets', 6),
  ('Company phone returned', 'assets', 7),
  ('Email / system access revoked', 'it', 8),
  ('Tool licenses deactivated', 'it', 9),
  ('Pending expense claims settled', 'finance', 10),
  ('Loan recovery calculated', 'finance', 11),
  ('Full & Final settlement initiated', 'finance', 12),
  ('Experience letter issued', 'documentation', 13),
  ('Relieving letter issued', 'documentation', 14)
ON CONFLICT DO NOTHING;

-- 5. Onboarding: RLS for existing tables
ALTER TABLE hr_onboarding_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_onboarding_task_employees ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_onboarding_stages' AND policyname = 'Authenticated users can view onboarding stages') THEN
    CREATE POLICY "Authenticated users can view onboarding stages"
      ON hr_onboarding_stages FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_onboarding_stages' AND policyname = 'Authenticated users can manage onboarding stages') THEN
    CREATE POLICY "Authenticated users can manage onboarding stages"
      ON hr_onboarding_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_onboarding_tasks' AND policyname = 'Authenticated users can view onboarding tasks') THEN
    CREATE POLICY "Authenticated users can view onboarding tasks"
      ON hr_onboarding_tasks FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_onboarding_tasks' AND policyname = 'Authenticated users can manage onboarding tasks') THEN
    CREATE POLICY "Authenticated users can manage onboarding tasks"
      ON hr_onboarding_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_onboarding_task_employees' AND policyname = 'Authenticated users can view onboarding task employees') THEN
    CREATE POLICY "Authenticated users can view onboarding task employees"
      ON hr_onboarding_task_employees FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_onboarding_task_employees' AND policyname = 'Authenticated users can manage onboarding task employees') THEN
    CREATE POLICY "Authenticated users can manage onboarding task employees"
      ON hr_onboarding_task_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Seed default onboarding stages and tasks
INSERT INTO hr_onboarding_stages (id, stage_title, sequence, is_final_stage)
VALUES 
  ('a0000001-0000-0000-0000-000000000001', 'Document Collection', 1, false),
  ('a0000001-0000-0000-0000-000000000002', 'Bank & Salary Setup', 2, false),
  ('a0000001-0000-0000-0000-000000000003', 'Compliance', 3, false),
  ('a0000001-0000-0000-0000-000000000004', 'System Access', 4, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO hr_onboarding_tasks (title, description, stage_id) VALUES
  ('Aadhaar card uploaded', 'Collect and verify Aadhaar card (front and back)', 'a0000001-0000-0000-0000-000000000001'),
  ('PAN card uploaded', 'Collect and verify PAN card', 'a0000001-0000-0000-0000-000000000001'),
  ('Passport photo uploaded', 'Collect passport-size photograph', 'a0000001-0000-0000-0000-000000000001'),
  ('Educational certificates uploaded', 'Collect degree/diploma certificates', 'a0000001-0000-0000-0000-000000000001'),
  ('Previous experience certificates', 'Collect experience/relieving letters from past employers', 'a0000001-0000-0000-0000-000000000001'),
  ('Bank account details collected', 'Collect bank account number, IFSC, branch details', 'a0000001-0000-0000-0000-000000000002'),
  ('Salary template assigned', 'Assign appropriate salary structure template', 'a0000001-0000-0000-0000-000000000002'),
  ('PF nomination form', 'Collect PF nomination details (Form 2)', 'a0000001-0000-0000-0000-000000000002'),
  ('NDA signed', 'Non-disclosure agreement signed by employee', 'a0000001-0000-0000-0000-000000000003'),
  ('Employee handbook acknowledged', 'Employee has read and acknowledged the handbook', 'a0000001-0000-0000-0000-000000000003'),
  ('Job contract signed', 'Employment contract signed by both parties', 'a0000001-0000-0000-0000-000000000003'),
  ('Company policy acknowledgement', 'Employee acknowledges company policies', 'a0000001-0000-0000-0000-000000000003'),
  ('Email account created', 'Company email account set up', 'a0000001-0000-0000-0000-000000000004'),
  ('Tool access provisioned', 'Access to required tools and software granted', 'a0000001-0000-0000-0000-000000000004'),
  ('Employee badge issued', 'Physical ID badge/access card issued', 'a0000001-0000-0000-0000-000000000004'),
  ('Biometric enrolled', 'Fingerprint/face enrolled in attendance system', 'a0000001-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- 7. Function to initialize onboarding checklist for an employee
CREATE OR REPLACE FUNCTION fn_initialize_onboarding(p_employee_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO hr_onboarding_task_employees (task_id, employee_id)
  SELECT t.id, p_employee_id
  FROM hr_onboarding_tasks t
  WHERE NOT EXISTS (
    SELECT 1 FROM hr_onboarding_task_employees te
    WHERE te.task_id = t.id AND te.employee_id = p_employee_id
  );
END;
$$;

-- 8. Function to initialize resignation checklist for an employee
CREATE OR REPLACE FUNCTION fn_initialize_resignation_checklist(p_employee_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO hr_resignation_checklist (employee_id, template_item_id, item_title)
  SELECT p_employee_id, t.id, t.item_title
  FROM hr_resignation_checklist_template t
  WHERE t.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM hr_resignation_checklist rc
    WHERE rc.employee_id = p_employee_id AND rc.template_item_id = t.id
  );
END;
$$;

-- 9. Add tracking columns to hr_onboarding_task_employees
ALTER TABLE hr_onboarding_task_employees 
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;