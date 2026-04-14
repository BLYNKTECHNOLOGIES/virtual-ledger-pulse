-- Recreate bank_accounts_with_balance with security_invoker
CREATE OR REPLACE VIEW public.bank_accounts_with_balance
WITH (security_invoker = true)
AS
SELECT ba.id,
    ba.account_name,
    ba.account_number,
    ba.bank_name,
    ba.branch,
    ba.balance,
    ba.lien_amount,
    ba.status,
    ba.created_at,
    ba.updated_at,
    ba."IFSC",
    ba.bank_account_holder_name,
    ba.account_status,
    ba.account_type,
    COALESCE(ba.balance + COALESCE(sum(
        CASE
            WHEN bt.transaction_type = ANY (ARRAY['INCOME','TRANSFER_IN']) THEN bt.amount
            WHEN bt.transaction_type = ANY (ARRAY['EXPENSE','TRANSFER_OUT']) THEN - bt.amount
            ELSE 0::numeric
        END), 0::numeric), ba.balance) AS computed_balance
FROM bank_accounts ba
LEFT JOIN bank_transactions bt ON ba.id = bt.bank_account_id
GROUP BY ba.id, ba.account_name, ba.account_number, ba.bank_name, ba.branch, ba.balance, ba.lien_amount, ba.status, ba.created_at, ba.updated_at, ba."IFSC", ba.bank_account_holder_name, ba.account_status, ba.account_type;

-- Recreate daily_reconciliation_summary with security_invoker
CREATE OR REPLACE VIEW public.daily_reconciliation_summary
WITH (security_invoker = true)
AS
SELECT date(submitted_at) AS recon_date,
    shift_label,
    status,
    has_mismatches,
    mismatch_count,
    jsonb_array_length(COALESCE(submitted_data, '[]'::jsonb)) AS method_count,
    (SELECT COALESCE(sum((elem.value ->> 'amount')::numeric), 0::numeric)
     FROM jsonb_array_elements(COALESCE(sr.submitted_data, '[]'::jsonb)) elem(value)
     WHERE (elem.value ->> 'amount') IS NOT NULL) AS total_submitted_amount,
    submitted_at,
    reviewed_at,
    id
FROM shift_reconciliations sr
ORDER BY submitted_at DESC;

-- Recreate hr_monthly_hours_summary with security_invoker
CREATE OR REPLACE VIEW public.hr_monthly_hours_summary
WITH (security_invoker = true)
AS
SELECT employee_id,
    date_trunc('month', attendance_date::timestamp with time zone)::date AS month,
    count(*) FILTER (WHERE attendance_status::text = ANY (ARRAY['present','late','half_day']::text[])) AS present_days,
    count(*) FILTER (WHERE attendance_status::text = 'absent') AS absent_days,
    COALESCE(sum(
        CASE
            WHEN check_in IS NOT NULL AND check_out IS NOT NULL THEN EXTRACT(epoch FROM check_out - check_in) / 3600.0
            ELSE 0::numeric
        END), 0::numeric)::numeric(10,2) AS total_worked_hours,
    COALESCE(sum(overtime_hours), 0::numeric) AS total_overtime_hours,
    COALESCE(sum(late_minutes), 0::bigint) AS total_late_minutes,
    COALESCE(sum(early_leave_minutes), 0::bigint) AS total_early_minutes,
    count(*) FILTER (WHERE late_minutes > 0) AS late_count,
    count(*) FILTER (WHERE early_leave_minutes > 0) AS early_out_count
FROM hr_attendance
GROUP BY employee_id, (date_trunc('month', attendance_date::timestamp with time zone));