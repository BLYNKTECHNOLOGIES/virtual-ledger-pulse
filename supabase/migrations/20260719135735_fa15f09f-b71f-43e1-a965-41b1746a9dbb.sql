
-- ============================================================
-- 1. hr_offer_letter_policy  (singleton settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hr_offer_letter_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton boolean NOT NULL DEFAULT true,

  -- Clause 6a — training-period salary
  training_period_months integer NOT NULL DEFAULT 1,
  training_flat_by_level jsonb NOT NULL DEFAULT '{"L6":10000,"L7":10000,"L8":10000}'::jsonb,
  training_pct_by_level  jsonb NOT NULL DEFAULT '{"L4":0.50,"L5":0.50}'::jsonb,
  training_statutory_exempt boolean NOT NULL DEFAULT true,
  training_razorpay_structure_id text,  -- Path A: swap to this structure for month 1

  -- Clause 6b — 25 % security deposit
  deposit_pct numeric(6,4) NOT NULL DEFAULT 0.2500,
  deposit_months integer[] NOT NULL DEFAULT ARRAY[2,3],
  deposit_refundable boolean NOT NULL DEFAULT true,

  -- Clause 8 — leave rules
  sl_medical_cert_threshold_days integer NOT NULL DEFAULT 2,
  cl_per_month numeric(4,2) NOT NULL DEFAULT 1.00,
  cl_carry_forward boolean NOT NULL DEFAULT false,
  sl_per_year numeric(5,2) NOT NULL DEFAULT 6.00,
  sl_lapses boolean NOT NULL DEFAULT true,

  -- Clause 18 — abandonment
  abandonment_days integer NOT NULL DEFAULT 3,
  abandonment_requires_approval boolean NOT NULL DEFAULT true,
  abandonment_forfeits_deposit boolean NOT NULL DEFAULT true,

  -- Clause 7 + 19 — probation & notice
  probation_months integer NOT NULL DEFAULT 4,
  notice_confirmed_days integer NOT NULL DEFAULT 30,
  notice_probation_forfeit_days integer NOT NULL DEFAULT 15,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,

  CONSTRAINT hr_offer_letter_policy_singleton_uq UNIQUE (is_singleton),
  CONSTRAINT hr_offer_letter_policy_singleton_ck CHECK (is_singleton = true)
);

GRANT SELECT, INSERT, UPDATE ON public.hr_offer_letter_policy TO authenticated;
GRANT ALL ON public.hr_offer_letter_policy TO service_role;

ALTER TABLE public.hr_offer_letter_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_offer_letter_policy_read"
  ON public.hr_offer_letter_policy FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "hr_offer_letter_policy_write"
  ON public.hr_offer_letter_policy FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Seed the single row using Clause 6–19 defaults if not present
INSERT INTO public.hr_offer_letter_policy (is_singleton)
VALUES (true)
ON CONFLICT (is_singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hr_offer_letter_policy_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_hr_offer_letter_policy_touch ON public.hr_offer_letter_policy;
CREATE TRIGGER trg_hr_offer_letter_policy_touch
  BEFORE UPDATE ON public.hr_offer_letter_policy
  FOR EACH ROW EXECUTE FUNCTION public.hr_offer_letter_policy_touch();

-- ============================================================
-- 2. hr_employee_work_info.level_band  (drives training-period lookup)
-- ============================================================
ALTER TABLE public.hr_employee_work_info
  ADD COLUMN IF NOT EXISTS level_band text
  CHECK (level_band IS NULL OR level_band IN ('L1','L2','L3','L4','L5','L6','L7','L8'));

CREATE INDEX IF NOT EXISTS idx_hr_employee_work_info_level_band
  ON public.hr_employee_work_info (level_band) WHERE level_band IS NOT NULL;

-- ============================================================
-- 3. hr_employee_deposit_schedule  (per-installment push tracker)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hr_employee_deposit_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  deposit_id uuid REFERENCES public.hr_employee_deposits(id) ON DELETE SET NULL,
  period_month date NOT NULL,          -- YYYY-MM-01 of the payroll period
  installment_no integer NOT NULL,     -- 1 for month 2, 2 for month 3, etc.
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','pushed','skipped','failed')),
  razorpay_input_id text,              -- id returned by payroll-inputs push
  razorpay_pushed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_employee_deposit_schedule_uq
    UNIQUE (employee_id, period_month, installment_no)
);

GRANT SELECT, INSERT, UPDATE ON public.hr_employee_deposit_schedule TO authenticated;
GRANT ALL ON public.hr_employee_deposit_schedule TO service_role;

CREATE INDEX IF NOT EXISTS idx_hr_employee_deposit_schedule_period
  ON public.hr_employee_deposit_schedule (period_month, status);
CREATE INDEX IF NOT EXISTS idx_hr_employee_deposit_schedule_emp
  ON public.hr_employee_deposit_schedule (employee_id);

ALTER TABLE public.hr_employee_deposit_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_employee_deposit_schedule_read"
  ON public.hr_employee_deposit_schedule FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "hr_employee_deposit_schedule_write"
  ON public.hr_employee_deposit_schedule FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_hr_employee_deposit_schedule_touch ON public.hr_employee_deposit_schedule;
CREATE TRIGGER trg_hr_employee_deposit_schedule_touch
  BEFORE UPDATE ON public.hr_employee_deposit_schedule
  FOR EACH ROW EXECUTE FUNCTION public.hr_offer_letter_policy_touch();

-- ============================================================
-- 4. Convenience accessor for the singleton policy row
-- ============================================================
CREATE OR REPLACE FUNCTION public.hr_get_offer_letter_policy()
RETURNS public.hr_offer_letter_policy
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.hr_offer_letter_policy WHERE is_singleton = true LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.hr_get_offer_letter_policy() TO authenticated, service_role;

-- ============================================================
-- 5. Helper: schedule security-deposit installments for one employee
-- Called at hire time and by a monthly cron catch-up.
-- Reads deposit_pct/deposit_months from the policy singleton.
-- Idempotent via the (employee_id, period_month, installment_no) unique key.
-- ============================================================
CREATE OR REPLACE FUNCTION public.hr_schedule_security_deposit(p_employee_id uuid)
RETURNS TABLE(period_month date, installment_no int, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_policy public.hr_offer_letter_policy;
  v_join   date;
  v_monthly_ctc numeric;
  v_deposit_total numeric;
  v_per_installment numeric;
  v_deposit_row public.hr_employee_deposits;
  v_month_offset int;
  v_period date;
  v_installment int := 0;
BEGIN
  SELECT * INTO v_policy FROM public.hr_offer_letter_policy WHERE is_singleton = true LIMIT 1;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'hr_offer_letter_policy singleton row missing';
  END IF;

  SELECT joining_date INTO v_join
    FROM public.hr_employee_work_info WHERE employee_id = p_employee_id;
  IF v_join IS NULL THEN RETURN; END IF;

  SELECT monthly_ctc INTO v_monthly_ctc
    FROM public.hr_employee_salary_structure_assignments
    WHERE employee_id = p_employee_id AND effective_from <= v_join
    ORDER BY effective_from DESC LIMIT 1;

  IF v_monthly_ctc IS NULL OR v_monthly_ctc <= 0 THEN RETURN; END IF;

  v_deposit_total := round(v_monthly_ctc * v_policy.deposit_pct, 2);
  v_per_installment := round(v_deposit_total / GREATEST(array_length(v_policy.deposit_months,1),1), 2);

  -- Ensure aggregate deposit row exists
  SELECT * INTO v_deposit_row FROM public.hr_employee_deposits
    WHERE employee_id = p_employee_id LIMIT 1;
  IF v_deposit_row IS NULL THEN
    INSERT INTO public.hr_employee_deposits (
      employee_id, total_deposit_amount, deduction_mode,
      deduction_value, deduction_start_month
    ) VALUES (
      p_employee_id, v_deposit_total, 'fixed_installment',
      v_per_installment,
      to_char(date_trunc('month', v_join) + INTERVAL '1 month', 'YYYY-MM')
    ) RETURNING * INTO v_deposit_row;
  END IF;

  FOREACH v_month_offset IN ARRAY v_policy.deposit_months LOOP
    v_installment := v_installment + 1;
    v_period := (date_trunc('month', v_join) + (v_month_offset - 1) * INTERVAL '1 month')::date;
    INSERT INTO public.hr_employee_deposit_schedule (
      employee_id, deposit_id, period_month, installment_no, amount
    ) VALUES (
      p_employee_id, v_deposit_row.id, v_period, v_installment, v_per_installment
    )
    ON CONFLICT (employee_id, period_month, installment_no) DO NOTHING;

    period_month := v_period;
    installment_no := v_installment;
    amount := v_per_installment;
    RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.hr_schedule_security_deposit(uuid) TO authenticated, service_role;
