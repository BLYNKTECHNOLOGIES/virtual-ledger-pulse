
-- Penalty rules: slab-based late penalties
CREATE TABLE public.hr_penalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_type text NOT NULL DEFAULT 'late_slab', -- 'late_slab', 'absence'
  late_count_min integer NOT NULL DEFAULT 0,
  late_count_max integer,
  penalty_type text NOT NULL DEFAULT 'days', -- 'days' (salary days deducted) or 'fixed' (₹ amount)
  penalty_value numeric NOT NULL DEFAULT 0.5, -- e.g., 0.5 = half day, or fixed ₹ amount
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Individual penalty records per employee per month
CREATE TABLE public.hr_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
  penalty_month text NOT NULL, -- 'YYYY-MM' format
  penalty_type text NOT NULL, -- 'late_slab', 'manual', 'absence'
  penalty_reason text NOT NULL,
  penalty_amount numeric NOT NULL DEFAULT 0, -- ₹ amount after calculation
  penalty_days numeric NOT NULL DEFAULT 0, -- salary days deducted (for slab-based)
  late_count integer, -- how many lates triggered this
  rule_id uuid REFERENCES public.hr_penalty_rules(id),
  payroll_run_id uuid, -- linked to payroll run when applied
  is_applied boolean NOT NULL DEFAULT false, -- true once deducted in payroll
  applied_at timestamptz,
  created_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default slab rules
INSERT INTO public.hr_penalty_rules (rule_name, rule_type, late_count_min, late_count_max, penalty_type, penalty_value, description) VALUES
  ('3 Lates = Half Day', 'late_slab', 3, 5, 'days', 0.5, 'Every 3 late marks results in half day salary deduction'),
  ('6 Lates = Full Day', 'late_slab', 6, 8, 'days', 1.0, 'Every 6 late marks results in full day salary deduction'),
  ('9+ Lates = 1.5 Days', 'late_slab', 9, null, 'days', 1.5, '9 or more late marks results in 1.5 days salary deduction');
