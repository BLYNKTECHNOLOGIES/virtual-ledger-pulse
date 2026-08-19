UPDATE public.hr_doc_field_catalog
SET field_key = 'monthly_ctc', label = 'Monthly CTC (annual ÷ 12)', resolver_id = 'salary.monthly_ctc'
WHERE field_key = 'monthly_gross';