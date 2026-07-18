
-- Promote previously-dropped/under-used RazorpayX response fields to first-class columns
-- so every documented response field maps to something in HRMS.

-- 1. hr_razorpay_employee_map: capture manager-employee-id from People/View
ALTER TABLE public.hr_razorpay_employee_map
  ADD COLUMN IF NOT EXISTS razorpay_manager_employee_id INTEGER;

-- 2. hr_razorpay_payslip_records: statutory + payroll snapshot extras
ALTER TABLE public.hr_razorpay_payslip_records
  ADD COLUMN IF NOT EXISTS pf_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS esi_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS professional_tax NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS additions_detail JSONB,
  ADD COLUMN IF NOT EXISTS deduction_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS do_not_pay BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot TEXT;

-- 3. hr_razorpay_contractor_payments: from + queued_on for check-status + pending list
ALTER TABLE public.hr_razorpay_contractor_payments
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS queued_on TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS razorpay_count_snapshot INTEGER;

-- 4. hr_attendance_regularization_requests: cache Razorpay-side pending state
-- (surfaced by attendance_fetch_range: requested-status / requested-check-in / etc.)
ALTER TABLE public.hr_attendance_regularization_requests
  ADD COLUMN IF NOT EXISTS razorpay_pending_side JSONB;

COMMENT ON COLUMN public.hr_razorpay_employee_map.razorpay_manager_employee_id
  IS 'Raw manager-employee-id from RazorpayX People/View. Resolved into hr_employee_work_info.reporting_manager_id when a local match exists.';
COMMENT ON COLUMN public.hr_razorpay_payslip_records.additions_detail
  IS 'Full RazorpayX additions object: { label: { name, amount, taxable, type } }. type 0=Bonus, 1=Reimbursement, 2=Arrear.';
COMMENT ON COLUMN public.hr_razorpay_contractor_payments.razorpay_count_snapshot
  IS 'Last known count from Contractor/View-Pending; used for drift banner vs. local row count.';
COMMENT ON COLUMN public.hr_attendance_regularization_requests.razorpay_pending_side
  IS 'Snapshot of requested-status / requested-leave-type / requested-check-in / requested-check-out returned by attendance/fetch.';
