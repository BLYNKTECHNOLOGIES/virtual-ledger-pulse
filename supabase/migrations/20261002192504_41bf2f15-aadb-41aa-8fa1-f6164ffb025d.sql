DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.hr_rebuild_loan_schedule(uuid)'::regprocedure);
  d := replace(d, '''scheduled'', 0, ''Auto-generated EMI schedule''', '''scheduled'', v_remaining - v_amt, ''Auto-generated EMI schedule''');
  EXECUTE d;
END $mig$;

-- Backfill: running balance after each instalment, per loan
WITH x AS (
  SELECT r.id, l.amount - SUM(r.amount) OVER (PARTITION BY r.loan_id ORDER BY r.installment_no, r.period_month) AS bal
  FROM public.hr_loan_repayments r JOIN public.hr_loans l ON l.id = r.loan_id
  WHERE r.status <> 'skipped'
)
UPDATE public.hr_loan_repayments r SET balance_after = GREATEST(x.bal, 0)
FROM x WHERE x.id = r.id AND r.balance_after IS DISTINCT FROM GREATEST(x.bal, 0);