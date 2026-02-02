
-- Clear transactional data only (preserve bank_accounts, wallets, payment methods, clients, users, etc.)
-- NOTE: order is important due to FKs

-- Purchase
DELETE FROM public.purchase_action_timings;
DELETE FROM public.purchase_order_reviews;
DELETE FROM public.purchase_order_status_history;
DELETE FROM public.purchase_order_payments;
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;

-- Sales
DELETE FROM public.sales_order_items;
DELETE FROM public.sales_orders;

-- Banking / Ledger
DELETE FROM public.bank_transactions;
DELETE FROM public.journal_entry_lines;
DELETE FROM public.journal_entries;

-- Stock / Wallet
DELETE FROM public.stock_transactions;
DELETE FROM public.stock_adjustments;
DELETE FROM public.wallet_fee_deductions;
DELETE FROM public.wallet_transactions;

-- Settlements
DELETE FROM public.payment_gateway_settlement_items;
DELETE FROM public.payment_gateway_settlements;
DELETE FROM public.pending_settlements;

-- Risk / Logs / Audit
DELETE FROM public.risk_detection_logs;
DELETE FROM public.risk_flags;
DELETE FROM public.system_action_logs;
DELETE FROM public.user_activity_log;
DELETE FROM public.debug_po_log;

-- KYC flows (requests/queries/approvals are transactional)
DELETE FROM public.kyc_queries;
DELETE FROM public.kyc_approval_requests;
DELETE FROM public.client_onboarding_approvals;
DELETE FROM public.rekyc_requests;

-- HRMS transactional docs
DELETE FROM public.payslips;
DELETE FROM public.employee_offboarding;
DELETE FROM public.offer_documents;
DELETE FROM public.interview_schedules;
DELETE FROM public.job_applicants;

-- Optional: keep compliance_documents & documents as they are uploads/config; not clearing them here.
