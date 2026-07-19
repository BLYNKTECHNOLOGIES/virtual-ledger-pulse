
-- Extend hr_razorpay_settings with mirrors of RazorpayX Attendance / Leave / Shifts settings.
-- These are org-level toggles set on the RazorpayX dashboard; HRMS mirrors them so
-- drift alerts, leave accruals, and LOP projections stay consistent with Razorpay.
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS attendance_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS attendance_enabled_for_contractors boolean NOT NULL DEFAULT false,
  -- Weekend pattern: which weekly-offs are treated as non-working days.
  -- Sun is almost always ON; Saturdays vary (1st/3rd, alternating, none, all).
  ADD COLUMN IF NOT EXISTS weekend_sun boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekend_sat_1 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekend_sat_2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekend_sat_3 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekend_sat_4 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekend_sat_5 boolean NOT NULL DEFAULT false,
  -- Leave policy toggles (from the Razorpay Leaves & Attendance settings tab).
  ADD COLUMN IF NOT EXISTS leave_allow_negative_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leave_allow_half_day boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS leave_require_remark boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS attendance_show_on_payslip boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lop_auto_add_for_unpaid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lop_calc_on_working_days boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS leave_calendar_financial_year boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shifts_track_timings boolean NOT NULL DEFAULT false,
  -- Leave-type catalogue mirror. JSONB array of:
  --   { code, name, default_leave, monthly_increment, max_leave, carry_forward, include_weekends }
  ADD COLUMN IF NOT EXISTS leave_types_mirror jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS leave_settings_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS leave_settings_updated_by uuid;

-- Seed the two leave types visible in the reference screenshot when the mirror
-- is still empty so the UI starts populated on first open.
UPDATE public.hr_razorpay_settings
SET leave_types_mirror = jsonb_build_array(
  jsonb_build_object('code','casual','name','Casual Leave','default_leave',0,'monthly_increment',1,'max_leave',18,'carry_forward',10,'include_weekends',false),
  jsonb_build_object('code','sick','name','Sick Leave','default_leave',1,'monthly_increment',0.5,'max_leave',6,'carry_forward',0,'include_weekends',false)
)
WHERE is_singleton = true AND (leave_types_mirror IS NULL OR jsonb_array_length(leave_types_mirror) = 0);
