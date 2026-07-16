
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'people_dismiss';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'payroll_view_payroll';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'payroll_add_additions';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'payroll_add_deduction';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'payroll_reset_modifications';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'payroll_do_not_pay';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'contractor_payment_create';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'contractor_payment_delete';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'contractor_payment_list';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'contractor_payment_status';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'advance_salary_create';
ALTER TYPE hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'attendance_fetch';
