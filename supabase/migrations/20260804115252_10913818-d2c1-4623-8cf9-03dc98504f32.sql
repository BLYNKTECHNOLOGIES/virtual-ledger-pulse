UPDATE public.bank_accounts
SET subsidiary_id = 'cb024bde-27cf-41d2-b577-38af6ff61fe6'
WHERE id = 'f1fb9834-7a02-48fd-a901-32ed4347b095';

UPDATE public.tds_payment_allocations t
SET subsidiary_id = 'cb024bde-27cf-41d2-b577-38af6ff61fe6',
    firm_name = 'M/s VERTEX SHIFT IT SOLUTIONS'
WHERE t.bank_account_id = 'f1fb9834-7a02-48fd-a901-32ed4347b095';