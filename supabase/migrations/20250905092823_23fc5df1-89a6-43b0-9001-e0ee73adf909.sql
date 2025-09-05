-- Clean all ERP data for fresh start - conservative approach
-- Disable triggers temporarily to avoid conflicts
SET session_replication_role = replica;

-- Truncate tables in dependency order - only core existing tables
TRUNCATE TABLE 
  -- Transaction tables (dependent)
  bank_transactions,
  wallet_transactions,
  stock_transactions,
  journal_entry_lines,
  
  -- Order item tables (dependent)
  purchase_order_items,
  
  -- Order tables
  purchase_orders,
  sales_orders,
  
  -- Client related tables
  client_onboarding_approvals,
  clients,
  leads,
  
  -- Employee tables
  employees,
  
  -- Product and inventory tables
  products,
  
  -- Account tables
  bank_accounts,
  wallets,
  ledger_accounts,
  journal_entries,
  
  -- Investigation and compliance tables
  investigation_updates,
  investigation_steps,
  investigation_approvals,
  account_investigations,
  bank_cases,
  compliance_documents,
  
  -- KYC tables
  kyc_queries,
  kyc_approval_requests,
  
  -- Clean debug log last
  debug_po_log
  
CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Add a confirmation entry to show cleanup completed
INSERT INTO debug_po_log (operation, payload) 
VALUES ('CLEANUP', 'Core ERP data successfully removed - system ready for fresh start');