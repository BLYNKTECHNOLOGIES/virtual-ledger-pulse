-- Remove the mistaken "UNION BANK" account and ALL references

-- purchase_payment_methods (FK on account_name)
DELETE FROM purchase_payment_methods WHERE bank_account_name = 'UNION BANK ';

-- purchase_orders
UPDATE purchase_orders SET bank_account_id = NULL WHERE bank_account_id = 'da1073a1-b3c2-493c-a013-868bc2201747';

-- sales_payment_methods
DELETE FROM sales_payment_methods WHERE bank_account_id = 'da1073a1-b3c2-493c-a013-868bc2201747';

-- bank_transactions: clear cross-references
UPDATE bank_transactions SET related_transaction_id = NULL 
WHERE related_transaction_id IN (
  SELECT id FROM bank_transactions WHERE bank_account_id = 'da1073a1-b3c2-493c-a013-868bc2201747'
);

-- bank_transactions on this account
DELETE FROM bank_transactions WHERE bank_account_id = 'da1073a1-b3c2-493c-a013-868bc2201747';

-- Finally delete the bank account
DELETE FROM bank_accounts WHERE id = 'da1073a1-b3c2-493c-a013-868bc2201747';