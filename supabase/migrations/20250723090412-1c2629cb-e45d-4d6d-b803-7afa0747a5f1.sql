-- Clear all business data while preserving users and core system data
-- Use CASCADE or handle all foreign key dependencies properly

-- First, let's disable foreign key checks temporarily and then re-enable them
SET session_replication_role = replica;

-- Delete all data in order, starting with the most dependent tables
TRUNCATE public.payment_gateway_settlement_items CASCADE;
TRUNCATE public.payment_gateway_settlements CASCADE;
TRUNCATE public.bank_transactions CASCADE;
TRUNCATE public.purchase_order_items CASCADE;
TRUNCATE public.purchase_orders CASCADE;
TRUNCATE public.warehouse_stock_movements CASCADE;
TRUNCATE public.wallet_transactions CASCADE;
TRUNCATE public.sales_order_items CASCADE;
TRUNCATE public.sales_orders CASCADE;
TRUNCATE public.kyc_queries CASCADE;
TRUNCATE public.kyc_approval_requests CASCADE;
TRUNCATE public.client_onboarding_approvals CASCADE;
TRUNCATE public.sales_payment_methods CASCADE;
TRUNCATE public.payer_payment_methods CASCADE;
TRUNCATE public.payers CASCADE;
TRUNCATE public.purchase_payment_methods CASCADE;
TRUNCATE public.payment_methods CASCADE;
TRUNCATE public.clients CASCADE;
TRUNCATE public.leads CASCADE;
TRUNCATE public.performance_review_criteria CASCADE;
TRUNCATE public.performance_reviews CASCADE;
TRUNCATE public.payslips CASCADE;
TRUNCATE public.employee_offboarding CASCADE;
TRUNCATE public.offer_documents CASCADE;
TRUNCATE public.interview_schedules CASCADE;
TRUNCATE public.job_applicants CASCADE;
TRUNCATE public.job_postings CASCADE;
TRUNCATE public.employees CASCADE;
TRUNCATE public.journal_entry_lines CASCADE;
TRUNCATE public.journal_entries CASCADE;
TRUNCATE public.ledger_accounts CASCADE;
TRUNCATE public.lien_updates CASCADE;
TRUNCATE public.lien_cases CASCADE;
TRUNCATE public.legal_communications CASCADE;
TRUNCATE public.legal_actions CASCADE;
TRUNCATE public.compliance_documents CASCADE;
TRUNCATE public.banking_credentials CASCADE;
TRUNCATE public.bank_communications CASCADE;
TRUNCATE public.closed_bank_accounts CASCADE;
TRUNCATE public.bank_accounts CASCADE;
TRUNCATE public.wallets CASCADE;
TRUNCATE public.products CASCADE;
TRUNCATE public.warehouses CASCADE;
TRUNCATE public.platforms CASCADE;
TRUNCATE public.pending_registrations CASCADE;

-- Re-enable foreign key checks
SET session_replication_role = DEFAULT;