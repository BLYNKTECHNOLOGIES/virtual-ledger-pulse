-- Update bank cases to remove zero balances (set to NULL instead of 0)
UPDATE bank_cases 
SET amount_involved = CASE WHEN amount_involved = 0 THEN NULL ELSE amount_involved END,
    amount_transferred = CASE WHEN amount_transferred = 0 THEN NULL ELSE amount_transferred END,
    expected_settlement_amount = CASE WHEN expected_settlement_amount = 0 THEN NULL ELSE expected_settlement_amount END,
    amount_lien_marked = CASE WHEN amount_lien_marked = 0 THEN NULL ELSE amount_lien_marked END,
    reported_balance = CASE WHEN reported_balance = 0 THEN NULL ELSE reported_balance END,
    expected_balance = CASE WHEN expected_balance = 0 THEN NULL ELSE expected_balance END,
    difference_amount = CASE WHEN difference_amount = 0 THEN NULL ELSE difference_amount END
WHERE case_number IN ('BD-20250816-001', 'ANW-20250816-001', 'CASE25080722');