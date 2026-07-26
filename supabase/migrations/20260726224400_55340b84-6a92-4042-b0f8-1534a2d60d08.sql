-- ========================================================================
-- V2 — ESS read fencing (ess_* views)
-- ========================================================================

-- Own profile
CREATE OR REPLACE VIEW public.ess_profile_v
WITH (security_invoker = on) AS
SELECT
  e.id                    AS employee_id,
  e.badge_id,
  e.first_name,
  e.last_name,
  e.email,
  e.phone,
  e.gender,
  e.dob,
  e.marital_status,
  e.profile_image_url,
  e.is_active,
  e.address,
  e.city,
  e.state,
  e.country
FROM public.hr_employees e
WHERE e.id = public.hr_ess_current_employee_id();

COMMENT ON VIEW public.ess_profile_v IS
  'V2 ESS: viewer-only profile basics. Whitelisted columns; no salary, PAN, statutory flags, or notes.';

GRANT SELECT ON public.ess_profile_v TO authenticated;

-- Own attendance (thin wrapper over V1 view)
CREATE OR REPLACE VIEW public.ess_attendance_day_v
WITH (security_invoker = on) AS
SELECT v.*
FROM public.hr_attendance_day_v v
WHERE v.employee_id = public.hr_ess_current_employee_id();

COMMENT ON VIEW public.ess_attendance_day_v IS
  'V2 ESS: viewer-only per-day attendance, derived from V1 canonical view.';

GRANT SELECT ON public.ess_attendance_day_v TO authenticated;

-- Own leave balances
CREATE OR REPLACE VIEW public.ess_leave_balance_v
WITH (security_invoker = on) AS
SELECT
  a.id,
  a.employee_id,
  a.leave_type_id,
  t.name          AS leave_type_name,
  t.code          AS leave_type_code,
  t.color         AS leave_type_color,
  t.is_paid,
  a.year,
  a.quarter,
  a.allocated_days,
  a.used_days,
  a.available_days,
  a.carry_forward_days,
  a.reset_date,
  a.expired_date
FROM public.hr_leave_allocations a
LEFT JOIN public.hr_leave_types t ON t.id = a.leave_type_id
WHERE a.employee_id = public.hr_ess_current_employee_id();

COMMENT ON VIEW public.ess_leave_balance_v IS
  'V2 ESS: viewer-only leave balances with type metadata.';

GRANT SELECT ON public.ess_leave_balance_v TO authenticated;

-- Own payslip summaries (metadata only — no raw breakdowns)
CREATE OR REPLACE VIEW public.ess_payslip_summary_v
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.employee_id,
  p.period_month,
  p.status,
  p.gross_salary,
  p.total_earnings,
  p.total_deductions,
  p.net_salary,
  p.working_days,
  p.present_days,
  p.leave_days,
  p.lop_days,
  p.payment_date,
  p.payment_reference,
  p.pdf_url,
  p.source,
  p.created_at
FROM public.hr_payslips p
WHERE p.employee_id = public.hr_ess_current_employee_id();

COMMENT ON VIEW public.ess_payslip_summary_v IS
  'V2 ESS: viewer-only payslip summaries. Excludes raw earnings/deductions JSON.';

GRANT SELECT ON public.ess_payslip_summary_v TO authenticated;

-- Org-wide milestones (birthdays only — no year, no exposed DOB)
CREATE OR REPLACE VIEW public.ess_milestones_v
WITH (security_invoker = on) AS
SELECT
  e.id                            AS employee_id,
  e.first_name,
  e.last_name,
  e.profile_image_url,
  EXTRACT(MONTH FROM e.dob)::int  AS birth_month,
  EXTRACT(DAY   FROM e.dob)::int  AS birth_day
FROM public.hr_employees e
WHERE e.is_active = true
  AND e.dob IS NOT NULL;

COMMENT ON VIEW public.ess_milestones_v IS
  'V2 ESS: org-wide upcoming birthdays. Day/month only; no year exposed.';

GRANT SELECT ON public.ess_milestones_v TO authenticated;


-- ========================================================================
-- V4 — RazorpayX outbox scaffold
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.razorpay_outbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL,           -- identity | bank | employment | salary | statutory | advance_salary | one_time_payment
  hr_employee_id    uuid,                    -- null for org-scope writes
  reference_id      text,                    -- e.g. revision id / advance id / batch id
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','in_flight','verified','partial','failed','exhausted','skipped')),
  attempt           int  NOT NULL DEFAULT 0,
  max_attempts      int  NOT NULL DEFAULT 6,
  next_attempt_at   timestamptz NOT NULL DEFAULT now(),
  last_error        text,
  receipt           jsonb,                    -- verified_at, verifiedTotal, diff summary
  verified_at       timestamptz,
  triggered_from    text,                    -- UI surface / caller
  triggered_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.razorpay_outbox TO authenticated;
GRANT ALL ON public.razorpay_outbox TO service_role;

ALTER TABLE public.razorpay_outbox ENABLE ROW LEVEL SECURITY;

-- HR admins can read/write the queue; everyone else can only see their own rows.
CREATE POLICY "razorpay_outbox_admin_all"
  ON public.razorpay_outbox
  FOR ALL
  TO authenticated
  USING (public.hr_is_hr_admin())
  WITH CHECK (public.hr_is_hr_admin());

CREATE POLICY "razorpay_outbox_self_read"
  ON public.razorpay_outbox
  FOR SELECT
  TO authenticated
  USING (
    hr_employee_id = public.hr_ess_current_employee_id()
    OR triggered_by = auth.uid()
  );

-- FIFO guarantee: only one queued row per (employee, kind).
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_outbox_one_queued_per_kind
  ON public.razorpay_outbox (hr_employee_id, kind)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS razorpay_outbox_due
  ON public.razorpay_outbox (status, next_attempt_at)
  WHERE status IN ('queued', 'in_flight');

CREATE OR REPLACE FUNCTION public.razorpay_outbox_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS razorpay_outbox_touch_trg ON public.razorpay_outbox;
CREATE TRIGGER razorpay_outbox_touch_trg
  BEFORE UPDATE ON public.razorpay_outbox
  FOR EACH ROW EXECUTE FUNCTION public.razorpay_outbox_touch();

COMMENT ON TABLE public.razorpay_outbox IS
  'V4 durable outbox. Every RazorpayX write enqueues here; the worker pops, pushes, verifies, and stamps a receipt. Per-(employee,kind) FIFO enforced by partial unique index.';