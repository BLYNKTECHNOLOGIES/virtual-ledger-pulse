INSERT INTO public.system_action_logs (action_type, entity_type, entity_id, module, metadata, created_at)
VALUES (
  'razorpay_payslip_restore_status',
  'hrms_payroll_history',
  '00000000-0000-0000-0000-000000000000',
  'hrms',
  jsonb_build_object(
    'source', 'payroll:view-payroll',
    'pdf_source', 'dashboard_only_not_api',
    'reflected_payslips_current_count', (SELECT count(*) FROM public.hr_payslips WHERE source='razorpay_import'),
    'razorpay_records_current_count', (SELECT count(*) FROM public.hr_razorpay_payslip_records),
    'note', 'Edge function patched for nested UI payload; redeploy required before next UI import.'
  ),
  now()
);