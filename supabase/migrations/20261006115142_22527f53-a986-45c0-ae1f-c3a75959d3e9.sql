UPDATE public.hr_razorpay_component_catalog SET is_active = false, updated_at = now()
 WHERE kind IN ('addition','deduction');

INSERT INTO public.hr_razorpay_component_catalog (kind,label,tds_mode,is_active,sort_order,source)
SELECT k, l, t, true, o, 'component_library_2026-10-06' FROM (VALUES
 ('addition','Comp-off Encashment','Taxable',1),('addition','Salary Arrears','Taxable',2),
 ('addition','F&F Settlement Dues','Taxable',3),('addition','Leave Encashment','Taxable',4),
 ('addition','Salary Advance Payout','Non-taxable',5),('addition','Security Deposit Refund','Non-taxable',6),
 ('addition','Recovery Refund','Non-taxable',7),('addition','Performance Bonus','Taxable',8),
 ('addition','Performance Linked Incentive','Taxable',9),('addition','Overtime','Taxable',10),
 ('addition','Joining Bonus','Taxable',11),('addition','Retention Bonus','Taxable',12),
 ('addition','Referral Bonus','Taxable',13),('addition','Festival Bonus','Taxable',14),
 ('addition','Employee of the Month Award','Taxable',15),('addition','Night Shift Allowance','Taxable',16),
 ('addition','Special Allowance Ad Hoc','Taxable',17),('addition','Correction','Taxable',18),
 ('addition','Reimbursement','Non-taxable',19),('addition','Travel Reimbursement','Non-taxable',20),
 ('addition','Mobile Internet Reimbursement','Non-taxable',21),('addition','ESIC Reimbursement','Non-taxable',22),
 ('addition','Legal Fees Reimbursement','Non-taxable',23),('addition','Employee Engagement','Taxable',24),
 ('deduction','Loss of Pay','Deduction',1),('deduction','Loan Repayment','Deduction',2),
 ('deduction','Advance Salary Recovery','Deduction',3),('deduction','Security Deposit','Deduction',4),
 ('deduction','Wrong Payment Recovery','Deduction',5),('deduction','F&F Recovery','Deduction',6),
 ('deduction','Salary Arrears Recovery','Deduction',7),('deduction','Notice Period Recovery','Deduction',8),
 ('deduction','Asset Damage Recovery','Deduction',9),('deduction','KPI Loss','Deduction',10),
 ('deduction','Penalty','Deduction',11),('deduction','Canteen Deduction','Deduction',12),
 ('deduction','Correction Recovery','Deduction',13)
) v(k,l,t,o)
ON CONFLICT (kind,label) DO UPDATE SET is_active = true, tds_mode = EXCLUDED.tds_mode,
  sort_order = EXCLUDED.sort_order, source = EXCLUDED.source, updated_at = now();

CREATE OR REPLACE FUNCTION public.hr_suggest_razorpay_label(p_label text, p_source text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE l text := coalesce(p_label,''); s text := coalesce(p_source,''); hit text;
BEGIN
  SELECT label INTO hit FROM hr_razorpay_component_catalog
   WHERE kind='addition' AND is_active AND label = btrim(l) LIMIT 1;
  IF hit IS NOT NULL THEN RETURN hit; END IF;
  IF l ~* 'comp[- ]?off' OR s ~* 'compoff|comp_off' THEN RETURN 'Comp-off Encashment'; END IF;
  IF l ~* 'f\s*&\s*f|\mfnf\M|full\s*(and|&)\s*final' OR s ~* 'fnf' THEN RETURN 'F&F Settlement Dues'; END IF;
  IF l ~* 'leave\s*encash' THEN RETURN 'Leave Encashment'; END IF;
  IF l ~* 'arrear|part[- ]?month|training|ctc' OR s ~* 'training_ctc|ctc_transition' THEN RETURN 'Salary Arrears'; END IF;
  IF l ~* 'esic|\mesi\M' AND l ~* 'reimburs' THEN RETURN 'ESIC Reimbursement'; END IF;
  IF l ~* 'legal' THEN RETURN 'Legal Fees Reimbursement'; END IF;
  IF l ~* 'travel|conveyance' THEN RETURN 'Travel Reimbursement'; END IF;
  IF l ~* 'mobile|internet|phone' THEN RETURN 'Mobile Internet Reimbursement'; END IF;
  IF l ~* 'reimburs' THEN RETURN 'Reimbursement'; END IF;
  IF l ~* 'deposit' OR s ~* 'deposit' THEN RETURN 'Security Deposit Refund'; END IF;
  IF l ~* 'refund' THEN RETURN 'Recovery Refund'; END IF;
  IF l ~* 'loan|advance' OR s ~* 'loan|advance' THEN RETURN 'Salary Advance Payout'; END IF;
  IF l ~* 'performance\s*linked|\mpli\M|incentive' THEN RETURN 'Performance Linked Incentive'; END IF;
  IF l ~* 'employee\s*of\s*the\s*month|\meom\M' THEN RETURN 'Employee of the Month Award'; END IF;
  IF l ~* 'joining' THEN RETURN 'Joining Bonus'; END IF;
  IF l ~* 'retention' THEN RETURN 'Retention Bonus'; END IF;
  IF l ~* 'referral' THEN RETURN 'Referral Bonus'; END IF;
  IF l ~* 'festival|diwali' THEN RETURN 'Festival Bonus'; END IF;
  IF l ~* 'night' THEN RETURN 'Night Shift Allowance'; END IF;
  IF l ~* 'overtime|\mot\M' THEN RETURN 'Overtime'; END IF;
  IF l ~* 'engagement' THEN RETURN 'Employee Engagement'; END IF;
  IF l ~* 'special\s*allowance|ad\s*hoc' THEN RETURN 'Special Allowance Ad Hoc'; END IF;
  IF l ~* 'correction' THEN RETURN 'Correction'; END IF;
  IF l ~* 'bonus' THEN RETURN 'Performance Bonus'; END IF;
  RETURN NULL;
END $function$;

UPDATE public.hr_payroll_input_additions
   SET razorpay_label = public.hr_suggest_razorpay_label(label, source)
 WHERE pushed_at IS NULL;