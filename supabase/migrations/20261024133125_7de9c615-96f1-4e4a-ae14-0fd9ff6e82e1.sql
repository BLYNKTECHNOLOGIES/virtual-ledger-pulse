-- HR Document Studio: date of birth as a shared variable ({{DATE_OF_BIRTH}}, {{DOB}}).
INSERT INTO public.hr_doc_field_catalog
  (field_key, label, field_group, data_type, formatter, resolver_id, description,
   is_sensitive, is_required, allows_instances, default_value, sort_order, is_active, aliases)
VALUES
  ('employee_date_of_birth', 'Date of Birth', 'employee', 'date', 'DD MMM YYYY', 'employee.date_of_birth',
   'Candidate (onboarding form) or employee — date of birth',
   true, false, false, NULL, 21, true,
   ARRAY['date_of_birth', 'dob', 'birth_date', 'candidate_dob', 'candidate_date_of_birth'])
ON CONFLICT (field_key) DO NOTHING;