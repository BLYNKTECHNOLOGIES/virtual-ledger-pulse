-- Clear all business data while preserving users and core system data
-- Keep users, roles, permissions, and system settings

-- Delete all business transactions and orders
DELETE FROM public.payment_gateway_settlement_items;
DELETE FROM public.payment_gateway_settlements;
DELETE FROM public.bank_transactions;
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;
DELETE FROM public.warehouse_stock_movements;
DELETE FROM public.wallet_transactions;

-- Delete all client and sales data
DELETE FROM public.client_onboarding_approvals;
DELETE FROM public.kyc_queries;
DELETE FROM public.kyc_approval_requests;
DELETE FROM public.clients;
DELETE FROM public.leads;

-- Delete all HR and employee data (except users)
DELETE FROM public.performance_review_criteria;
DELETE FROM public.performance_reviews;
DELETE FROM public.payslips;
DELETE FROM public.employee_offboarding;
DELETE FROM public.offer_documents;
DELETE FROM public.interview_schedules;
DELETE FROM public.job_applicants;
DELETE FROM public.job_postings;
DELETE FROM public.employees;

-- Delete all financial and accounting data
DELETE FROM public.journal_entry_lines;
DELETE FROM public.journal_entries;
DELETE FROM public.ledger_accounts;
DELETE FROM public.lien_updates;
DELETE FROM public.lien_cases;
DELETE FROM public.legal_communications;
DELETE FROM public.legal_actions;
DELETE FROM public.compliance_documents;

-- Delete all banking and payment data
DELETE FROM public.payer_payment_methods;
DELETE FROM public.payers;
DELETE FROM public.purchase_payment_methods;
DELETE FROM public.payment_methods;
DELETE FROM public.banking_credentials;
DELETE FROM public.bank_communications;
DELETE FROM public.closed_bank_accounts;
DELETE FROM public.bank_accounts;

-- Delete product and inventory data
DELETE FROM public.wallets;
DELETE FROM public.products;
DELETE FROM public.warehouses;
DELETE FROM public.platforms;

-- Delete organizational structure (but keep departments and positions as templates)
-- DELETE FROM public.positions;
-- DELETE FROM public.departments;

-- Reset any auto-incrementing sequences or counters that might exist
-- Note: Most tables use UUIDs, so this mainly affects any manual counter fields

-- Clear any pending registrations
DELETE FROM public.pending_registrations;

-- Keep these tables intact:
-- - users (as requested)
-- - roles  
-- - role_permissions
-- - user_roles
-- - departments (as organizational templates)
-- - positions (as job templates)
-- - system_settings (if exists)
-- - email_verification_tokens
-- - password_reset_tokens