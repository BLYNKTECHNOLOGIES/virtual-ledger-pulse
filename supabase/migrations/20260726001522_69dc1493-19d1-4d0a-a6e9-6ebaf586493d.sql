
DROP VIEW IF EXISTS public.hr_payslips_v;
CREATE VIEW public.hr_payslips_v AS
SELECT
  rpr.id,
  rpr.hr_employee_id                              AS employee_id,
  rpr.period_month,
  rpr.gross_earnings                              AS gross,
  rpr.total_deductions,
  rpr.net_pay                                     AS net,
  rpr.tds_amount,
  rpr.pf_amount,
  rpr.esi_amount,
  rpr.professional_tax,
  rpr.reg_working_days                            AS working_days,
  rpr.pdf_url,
  rpr.razorpay_payslip_id,
  rpr.pulled_at,
  rpr.created_at,
  rpr.updated_at,
  'razorpay'::text                                AS source
FROM public.hr_razorpay_payslip_records rpr;

GRANT SELECT ON public.hr_payslips_v TO authenticated;
GRANT ALL   ON public.hr_payslips_v TO service_role;

DROP FUNCTION IF EXISTS public.hr_payslip_link_orphans();
CREATE FUNCTION public.hr_payslip_link_orphans()
RETURNS TABLE (
  legacy_id       uuid,
  employee_id     uuid,
  period_month    date,
  net_salary      numeric,
  status          text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.employee_id, p.period_month, p.net_salary, p.status::text
  FROM public.hr_payslips p
  LEFT JOIN public.hr_razorpay_payslip_records r
    ON r.hr_employee_id = p.employee_id
   AND date_trunc('month', r.period_month) = date_trunc('month', p.period_month)
  WHERE r.id IS NULL
  ORDER BY p.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.hr_payslip_link_orphans() TO authenticated, service_role;

-- Salary Advance
CREATE OR REPLACE FUNCTION public.hr_create_salary_advance(
  p_employee_id uuid, p_amount numeric, p_reason text,
  p_recover_from_month date, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Advance amount must be positive'; END IF;
  IF p_recover_from_month IS NULL THEN RAISE EXCEPTION 'Recover-from month is required'; END IF;
  IF p_employee_id IS NULL THEN RAISE EXCEPTION 'Employee is required'; END IF;

  INSERT INTO public.hr_loans (
    employee_id, loan_type, advance_type, amount, outstanding_balance,
    emi_amount, tenure_months, interest_rate,
    start_emi_date, disbursement_date, repayment_source, reason, notes, status
  ) VALUES (
    p_employee_id, 'salary_advance', 'advance', p_amount, p_amount,
    p_amount, 1, 0,
    date_trunc('month', p_recover_from_month)::date, CURRENT_DATE,
    'salary_deduction', p_reason, p_notes, 'pending_push'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.hr_create_salary_advance(uuid, numeric, text, date, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_apply_razorpay_advance_ack(
  p_loan_id uuid, p_razorpay_advance_salary_id integer, p_status text DEFAULT 'active'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.hr_loans
     SET razorpay_advance_salary_id = p_razorpay_advance_salary_id,
         razorpay_pushed_at         = now(),
         status                     = COALESCE(p_status, 'active'),
         approved_at                = COALESCE(approved_at, now())
   WHERE id = p_loan_id;
END; $$;
REVOKE ALL ON FUNCTION public.hr_apply_razorpay_advance_ack(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.hr_apply_razorpay_advance_ack(uuid, integer, text) TO service_role;

-- Interventions
ALTER TABLE public.hr_attendance_regularization_requests
  ADD COLUMN IF NOT EXISTS reason_code text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_reg_reason_code_ck') THEN
    ALTER TABLE public.hr_attendance_regularization_requests
      ADD CONSTRAINT hr_reg_reason_code_ck
      CHECK (reason_code IS NULL OR reason_code IN (
        'missed_punch','device_offline','wrong_shift_mapped',
        'stale_session_resolution','approved_offsite','other_documented'
      ));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.hr_attendance_intervention_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid REFERENCES public.hr_attendance_regularization_requests(id) ON DELETE SET NULL,
  session_id   uuid,
  employee_id  uuid NOT NULL,
  action       text NOT NULL,
  reason_code  text,
  notes        text,
  actor_id     uuid,
  actor_email  text,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.hr_attendance_intervention_log TO authenticated;
GRANT ALL             ON public.hr_attendance_intervention_log TO service_role;
ALTER TABLE public.hr_attendance_intervention_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR reads intervention log" ON public.hr_attendance_intervention_log;
CREATE POLICY "HR reads intervention log" ON public.hr_attendance_intervention_log
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated inserts intervention log" ON public.hr_attendance_intervention_log;
CREATE POLICY "Authenticated inserts intervention log" ON public.hr_attendance_intervention_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS hr_intervention_log_emp_idx
  ON public.hr_attendance_intervention_log (employee_id, created_at DESC);

-- Email dispatch health
CREATE OR REPLACE FUNCTION public.hr_email_dispatch_health()
RETURNS TABLE (sent_24h integer, failed_24h integer, pending_now integer, last_activity timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT count(*) FROM public.hr_email_send_log
              WHERE status = 'sent' AND created_at > now() - interval '24 hours'), 0)::int,
    COALESCE((SELECT count(*) FROM public.hr_email_send_log
              WHERE status IN ('failed','bounced','error') AND created_at > now() - interval '24 hours'), 0)::int,
    COALESCE((SELECT count(*) FROM public.hr_email_send_log
              WHERE status = 'pending'), 0)::int,
    (SELECT max(created_at) FROM public.hr_email_send_log);
$$;
GRANT EXECUTE ON FUNCTION public.hr_email_dispatch_health() TO authenticated, service_role;

-- Sandbox auto-revoke
CREATE OR REPLACE FUNCTION public.hr_razorpay_sandbox_auto_revoke()
RETURNS TABLE (revoked integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0;
BEGIN
  UPDATE public.hr_razorpay_settings
     SET sandbox_mode = false, sandbox_revoke_after = NULL
   WHERE sandbox_mode = true
     AND sandbox_revoke_after IS NOT NULL
     AND sandbox_revoke_after < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    BEGIN
      PERFORM public.hr_broadcast_notification_to_hr(
        'sandbox_auto_revoked',
        'RazorpayX sandbox mode auto-revoked',
        'The sandbox window expired; the proxy is now routed to production.',
        '/hrms/payroll/razorpay-sync'
      );
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END IF;

  RETURN QUERY SELECT v_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.hr_razorpay_sandbox_auto_revoke() TO authenticated, service_role;
