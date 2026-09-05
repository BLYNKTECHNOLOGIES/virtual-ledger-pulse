CREATE OR REPLACE VIEW public.hr_payroll_auto_recoveries AS
 SELECT r.id,
    'loan'::text AS source_kind,
    r.loan_id AS parent_id,
    r.employee_id,
    e.badge_id,
    btrim((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text)) AS employee_name,
    r.period_month,
    r.installment_no,
    r.amount,
    r.status,
    r.razorpay_input_id,
    r.razorpay_pushed_at,
    r.failure_reason,
        CASE
            WHEN COALESCE(l.loan_type, ''::text) ~~ '%advance%'::text THEN 'Salary advance recovery'::text
            ELSE 'Loan EMI'::text
        END AS label,
    'LOAN_EMI_M'::text || r.installment_no AS razorpay_code,
    COALESCE(l.amount, 0::numeric) AS total_amount,
    COALESCE(l.amount, 0::numeric) - COALESCE(l.outstanding_balance, COALESCE(l.amount, 0::numeric)) AS collected_amount,
    ( SELECT count(*) AS count
           FROM hr_loan_repayments x
          WHERE x.loan_id = l.id) AS total_installments,
    ( SELECT COALESCE(sum(x.amount), 0::numeric) AS "coalesce"
           FROM hr_loan_repayments x
          WHERE x.loan_id = l.id AND (x.status = ANY (ARRAY['scheduled'::text, 'failed'::text, 'pushed'::text])) AND x.period_month > r.period_month) AS remaining_after
   FROM hr_loan_repayments r
     JOIN hr_loans l ON l.id = r.loan_id
     LEFT JOIN hr_employees e ON e.id = r.employee_id
  WHERE COALESCE(l.status, ''::text) <> ALL (ARRAY['closed'::text,'cancelled'::text,'rejected'::text])
     OR r.status = ANY (ARRAY['pushed'::text,'paid'::text])
UNION ALL
 SELECT s.id,
    'deposit'::text AS source_kind,
    s.deposit_id AS parent_id,
    s.employee_id,
    e.badge_id,
    btrim((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text)) AS employee_name,
    s.period_month,
    s.installment_no,
    s.amount,
    s.status,
    s.razorpay_input_id,
    s.razorpay_pushed_at,
    s.failure_reason,
        CASE
            WHEN s.deposit_type = 'error_recovery'::text THEN 'Error recovery'::text
            ELSE 'Security deposit'::text
        END AS label,
        CASE
            WHEN s.deposit_type = 'error_recovery'::text THEN 'ERROR_RECOVERY_M'::text
            ELSE 'SECURITY_DEPOSIT_M'::text
        END || s.installment_no AS razorpay_code,
    COALESCE(d.total_deposit_amount, 0::numeric) AS total_amount,
    COALESCE(d.collected_amount, 0::numeric) AS collected_amount,
    ( SELECT count(*) AS count
           FROM hr_employee_deposit_schedule x
          WHERE x.deposit_id = d.id) AS total_installments,
    ( SELECT COALESCE(sum(x.amount), 0::numeric) AS "coalesce"
           FROM hr_employee_deposit_schedule x
          WHERE x.deposit_id = d.id AND (x.status = ANY (ARRAY['scheduled'::text, 'failed'::text, 'pushed'::text])) AND x.period_month > s.period_month) AS remaining_after
   FROM hr_employee_deposit_schedule s
     JOIN hr_employee_deposits d ON d.id = s.deposit_id
     LEFT JOIN hr_employees e ON e.id = s.employee_id
  WHERE (COALESCE(d.fnf_state, 'none'::text) <> ALL (ARRAY['reserved'::text,'settled'::text]))
        AND COALESCE(d.is_settled, false) = false
        AND COALESCE(d.is_paused, false) = false
        AND COALESCE(d.is_fully_collected, false) = false
     OR s.status = ANY (ARRAY['pushed'::text,'paid'::text,'collected'::text]);

GRANT SELECT ON public.hr_payroll_auto_recoveries TO authenticated;
GRANT SELECT ON public.hr_payroll_auto_recoveries TO service_role;