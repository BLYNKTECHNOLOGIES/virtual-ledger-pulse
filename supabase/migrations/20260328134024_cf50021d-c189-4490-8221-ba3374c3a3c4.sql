-- EMERGENCY: Restore anon access to all tables until Supabase Auth migration (Phase 2) is complete
-- These will be removed once all users authenticate via Supabase Auth

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'account_investigations','ad_action_logs','ad_automation_exclusions','ad_payment_methods',
    'ad_pricing_logs','ad_pricing_rules','ad_rest_timer','asset_movement_history',
    'asset_movement_sync_metadata','asset_value_history','bank_accounts','bank_bulk_formats',
    'bank_cases','bank_communications','bank_transactions','banking_credentials',
    'beneficiary_bank_additions','beneficiary_records','binance_order_history','binance_sync_metadata',
    'blocked_phone_numbers','chat_message_senders','client_communication_logs','client_limit_requests',
    'client_onboarding_approvals','clients','closed_bank_accounts','compliance_documents',
    'conversion_journal_entries','counterparty_contact_records','counterparty_pan_records',
    'daily_gross_profit_history','departments','documents','email_notification_log',
    'email_send_log','email_send_state','employee_offboarding','employees',
    'erp_action_queue','erp_balance_snapshot_lines','erp_balance_snapshots','erp_drift_alerts',
    'erp_product_conversions','erp_task_activity_log','erp_task_assignments','erp_task_attachments',
    'erp_task_comments','erp_task_spectators','erp_task_templates','erp_tasks',
    'hr_announcements','hr_asset_assignments','hr_assets','hr_attendance',
    'hr_attendance_activity','hr_attendance_activity_archive','hr_attendance_daily',
    'hr_attendance_punches','hr_attendance_punches_archive','hr_biometric_devices',
    'hr_bonus_points','hr_candidate_notes','hr_candidate_ratings','hr_candidate_stages',
    'hr_candidate_tasks','hr_candidates','hr_compoff_credits','hr_deposit_transactions',
    'hr_disciplinary_actions','hr_employee_bank_details','hr_employee_deposits','hr_employee_notes',
    'hr_employee_salary','hr_employee_salary_structures','hr_employee_tags','hr_employee_work_info',
    'hr_employees','hr_feedback_360','hr_helpdesk_tickets','hr_holidays',
    'hr_interviews','hr_leave_allocation_requests','hr_leave_allocations','hr_leave_requests',
    'hr_leave_types','hr_notifications','hr_objectives','hr_offer_letters',
    'hr_onboarding_stage_managers','hr_onboarding_stages','hr_onboarding_task_employees',
    'hr_onboarding_tasks','hr_payroll_runs','hr_payslips','hr_penalties',
    'hr_penalty_rules','hr_policies','hr_recruitment_managers','hr_recruitments',
    'hr_rejected_candidates','hr_salary_components','hr_salary_structure_template_items',
    'hr_salary_structure_templates','hr_shifts','hr_skill_zone_candidates','hr_skill_zones',
    'hr_skills','hr_stage_managers','hr_stage_notes','hr_stages',
    'hr_survey_questions','hr_survey_responses','hr_survey_templates',
    'interview_schedules','investigation_approvals','investigation_steps','investigation_updates',
    'job_applicants','job_postings','journal_entries','kyc_approval_requests',
    'kyc_queries','leads','ledger_accounts','legal_actions',
    'legal_communications','lien_cases','lien_updates','offer_documents',
    'p2p_auto_pay_log','p2p_auto_pay_settings','p2p_auto_reply_log','p2p_auto_reply_processed',
    'p2p_auto_reply_rules','p2p_chat_media','p2p_counterparties','p2p_merchant_schedules',
    'p2p_order_chats','p2p_order_records','p2p_order_types','p2p_quick_replies',
    'password_reset_requests','payment_gateway_settlement_items','payment_gateway_settlements',
    'payment_methods','payment_methods_master','pending_registrations','pending_settlements',
    'performance_review_criteria','performance_reviews','platforms','positions',
    'products','purchase_action_timings','purchase_order_items','purchase_order_payment_splits',
    'purchase_order_payments','purchase_order_reviews','purchase_order_status_history',
    'purchase_orders','purchase_payment_methods','realized_pnl_events','rekyc_requests',
    'reversal_guards','risk_detection_logs','risk_flags','role_functions',
    'role_permissions','roles','sales_order_items','sales_orders',
    'sales_payment_methods','shift_reconciliations','small_buys_config','small_buys_order_map',
    'small_buys_sync','small_buys_sync_log','small_sales_config','small_sales_order_map',
    'small_sales_sync','small_sales_sync_log','spot_trade_history','stock_adjustments',
    'subsidiaries','system_action_logs','system_settings','tds_records',
    'terminal_alternate_upi_requests','terminal_assignment_audit_logs','terminal_auto_assignment_config',
    'terminal_auto_assignment_log','terminal_auto_reply_exclusions','terminal_biometric_sessions',
    'terminal_bypass_codes','terminal_exchange_accounts','terminal_internal_chat_reads',
    'terminal_internal_messages','terminal_mpi_snapshots','terminal_notifications',
    'terminal_operator_assignments','terminal_order_assignments','terminal_order_size_ranges',
    'terminal_payer_assignments','terminal_payer_order_locks','terminal_payer_order_log',
    'terminal_purchase_sync','terminal_sales_sync','terminal_user_exchange_mappings',
    'terminal_user_presence','terminal_user_profiles','terminal_user_size_range_mappings',
    'terminal_user_supervisor_mappings','terminal_wallet_links','terminal_webauthn_challenges',
    'terminal_webauthn_credentials','user_activity_log','user_preferences',
    'user_roles','user_sidebar_preferences','users','wallet_asset_balances',
    'wallet_asset_positions','wallet_fee_deductions','wallet_transactions','wallets'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip if anon ALL policy already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = tbl 
        AND policyname = 'temp_anon_all_' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
        'temp_anon_all_' || tbl, tbl
      );
    END IF;
  END LOOP;
END $$;