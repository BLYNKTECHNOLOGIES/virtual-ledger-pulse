-- Remove the incorrectly recorded ₹50,000 INCOME entry for SO-TRM-693038637056 from INDUSIND SS
-- The sales entry was received via POS but wrongly credited to the bank account directly
-- The balance trigger will automatically adjust INDUSIND SS balance by -50,000

DELETE FROM public.bank_transactions 
WHERE id = '2e8db13f-e1db-4b80-b07f-607d776e405d';