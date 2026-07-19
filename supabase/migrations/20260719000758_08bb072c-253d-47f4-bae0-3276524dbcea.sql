INSERT INTO public.system_action_logs (action_type, entity_type, entity_id, module, metadata, created_at)
VALUES (
  'state_log_append',
  'docs_state_log',
  '00000000-0000-0000-0000-000000000000',
  'hrms',
  jsonb_build_object(
    'entry', '2026-07-18: RazorpayX payroll history restored to API-first model — payroll:view-payroll is canonical; PDFs dashboard-only.',
    'file', 'docs/STATE_LOG.md'
  ),
  now()
);