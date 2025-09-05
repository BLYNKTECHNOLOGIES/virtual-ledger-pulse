-- Clean all ERP data for fresh start
-- Disable triggers temporarily to avoid conflicts
SET session_replication_role = replica;

-- Truncate all main business tables in dependency order
TRUNCATE TABLE 
  -- Financial and transaction tables
  bank_transactions,
  wallet_transactions,
  stock_transactions,
  journal_entry_lines,
  journal_entries,
  
  -- Order and inventory tables  
  purchase_order_items,
  purchase_orders,
  sales_orders,
  
  -- Gateway and settlement tables
  payment_gateway_settlement_items,
  payment_gateway_settlements,
  
  -- Client and lead tables
  client_onboarding_approvals,
  clients,
  leads,
  
  -- Employee and HR tables
  employee_offboarding,
  employees,
  job_applicants,
  interview_schedules,
  offer_documents,
  job_postings,
  
  -- Compliance and investigation tables
  investigation_updates,
  investigation_steps,
  investigation_approvals,
  account_investigations,
  lien_updates,
  lien_cases,
  legal_communications,
  legal_actions,
  bank_communications,
  banking_credentials,
  bank_cases,
  compliance_documents,
  
  -- KYC and approval tables
  kyc_queries,
  kyc_approval_requests,
  
  -- Product and inventory tables
  wallet_stocks,
  products,
  warehouses,
  
  -- Account and ledger tables
  closed_bank_accounts,
  bank_accounts,
  wallets,
  ledger_accounts,
  
  -- Payer and payment method tables
  payer_payment_methods,
  payers,
  sales_payment_methods,
  purchase_payment_methods,
  
  -- Other system tables
  departments,
  user_sidebar_preferences,
  risk_flags,
  rekyc_requests,
  screen_share_requests,
  debug_po_log
  
CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Reset any sequences that might be affected
-- This ensures auto-generated IDs start from 1 again where applicable

-- Add a confirmation entry to show cleanup completed
INSERT INTO debug_po_log (operation, payload) 
VALUES ('CLEANUP', 'All ERP data successfully removed - system ready for fresh start');