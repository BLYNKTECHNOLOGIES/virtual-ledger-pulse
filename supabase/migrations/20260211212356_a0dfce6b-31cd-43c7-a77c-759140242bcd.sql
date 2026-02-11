-- Insert new system function for ERP Reconciliation
INSERT INTO public.system_functions (function_key, function_name, description, module)
VALUES ('erp_reconciliation', 'ERP Reconciliation', 'Access to Action Required widget for reconciling Binance asset movements (deposits/withdrawals) into ERP records.', 'dashboard');
