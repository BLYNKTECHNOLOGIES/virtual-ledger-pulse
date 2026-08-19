INSERT INTO public.hr_doc_field_catalog (field_key,label,field_group,data_type,resolver_id,is_active,sort_order)
VALUES
 ('company_registered_address','Company Registered Address','company','text','company.registered_address',true,60),
 ('company_pan','Company PAN','company','text','company.pan',true,61),
 ('company_phone','Company Phone','company','text','company.phone',true,62),
 ('company_email','Company Email','company','text','company.email',true,63),
 ('company_website','Company Website','company','text','company.website',true,64)
ON CONFLICT (field_key) DO NOTHING;