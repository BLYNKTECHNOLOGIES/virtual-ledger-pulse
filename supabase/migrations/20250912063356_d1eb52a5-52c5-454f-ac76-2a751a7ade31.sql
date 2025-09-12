-- Clear all data from all tables while preserving table structures

-- Disable triggers temporarily to avoid cascading issues
SET session_replication_role = replica;

-- Clear all tables in dependency order (tables with foreign keys first)
DELETE FROM email_verification_tokens;
DELETE FROM password_reset_tokens;
DELETE FROM investigation_updates;
DELETE FROM investigation_steps;
DELETE FROM investigation_approvals;
DELETE FROM lien_updates;
DELETE FROM lien_cases;
DELETE FROM kyc_queries;
DELETE FROM kyc_approval_requests;
DELETE FROM offer_documents;
DELETE FROM interview_schedules;
DELETE FROM job_applicants;
DELETE FROM job_postings;
DELETE FROM employee_offboarding;
DELETE FROM payer_payment_methods;
DELETE FROM payers;
DELETE FROM payment_gateway_settlement_items;
DELETE FROM bank_communications;
DELETE FROM legal_communications;
DELETE FROM legal_actions;
DELETE FROM compliance_documents;
DELETE FROM banking_credentials;
DELETE FROM account_investigations;
DELETE FROM bank_cases;
DELETE FROM closed_bank_accounts;
DELETE FROM client_onboarding_approvals;
DELETE FROM journal_entry_lines;
DELETE FROM journal_entries;
DELETE FROM ledger_accounts;
DELETE FROM bank_transactions;
DELETE FROM bank_accounts;
DELETE FROM leads;
DELETE FROM clients;
DELETE FROM departments;
DELETE FROM employees;
DELETE FROM debug_po_log;

-- Clear any remaining tables that might exist
TRUNCATE TABLE IF EXISTS wallet_transactions CASCADE;
TRUNCATE TABLE IF EXISTS wallets CASCADE;
TRUNCATE TABLE IF EXISTS stock_transactions CASCADE;
TRUNCATE TABLE IF EXISTS purchase_order_items CASCADE;
TRUNCATE TABLE IF EXISTS purchase_orders CASCADE;
TRUNCATE TABLE IF EXISTS sales_orders CASCADE;
TRUNCATE TABLE IF EXISTS products CASCADE;
TRUNCATE TABLE IF EXISTS suppliers CASCADE;
TRUNCATE TABLE IF EXISTS customers CASCADE;
TRUNCATE TABLE IF EXISTS user_roles CASCADE;
TRUNCATE TABLE IF EXISTS role_permissions CASCADE;
TRUNCATE TABLE IF EXISTS roles CASCADE;
TRUNCATE TABLE IF EXISTS users CASCADE;
TRUNCATE TABLE IF EXISTS sales_payment_methods CASCADE;
TRUNCATE TABLE IF EXISTS purchase_payment_methods CASCADE;
TRUNCATE TABLE IF EXISTS risk_flags CASCADE;
TRUNCATE TABLE IF EXISTS risk_detection_logs CASCADE;
TRUNCATE TABLE IF EXISTS rekyc_requests CASCADE;
TRUNCATE TABLE IF EXISTS pending_registrations CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Reset sequences for auto-incrementing columns if any
SELECT setval(pg_get_serial_sequence('debug_po_log', 'id'), 1, false);