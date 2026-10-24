-- HR Document Studio: one shared variable dictionary for every template,
-- letters issued to candidates (offer letters) from their onboarding record,
-- and the standard CTC break-up read without payroll-settings access.

-- 1. Dictionary aliases: one variable answers to several template spellings
--    ({{CANDIDATE_NAME}} and {{EMPLOYEE_NAME}} are the same variable).
ALTER TABLE public.hr_doc_field_catalog
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

-- 2. Who a template is issued to.
ALTER TABLE public.hr_doc_templates
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'employee';
DO $$ BEGIN
  ALTER TABLE public.hr_doc_templates
    ADD CONSTRAINT hr_doc_templates_subject_chk CHECK (subject IN ('employee', 'candidate', 'any'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Letters issued to a candidate from their onboarding record.
ALTER TABLE public.hr_documents_issued
  ADD COLUMN IF NOT EXISTS onboarding_id uuid REFERENCES public.hr_employee_onboarding(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS hr_documents_issued_onboarding_idx
  ON public.hr_documents_issued (onboarding_id) WHERE onboarding_id IS NOT NULL;

-- 4. Standard CTC structure for letters. Payroll settings are readable only by
--    RazorpayX-sync users; HR staff get the component split and nothing else.
CREATE OR REPLACE FUNCTION public.hr_doc_standard_ctc_structure()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT jsonb_build_object(
           'enabled', COALESCE(s.use_xpayroll_default_structure, false),
           'components', COALESCE(s.default_structure_components, '[]'::jsonb))
    INTO v
    FROM public.hr_razorpay_settings s
   LIMIT 1;
  RETURN COALESCE(v, jsonb_build_object('enabled', false, 'components', '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.hr_doc_standard_ctc_structure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_doc_standard_ctc_structure() TO authenticated;

-- 5. Letters issued from an onboarding record always follow that record's employee
--    link. When HR (or a server job) links, re-links or unlinks it, they move: filed
--    copies under the previous employee are withdrawn and the live letters are
--    filed for the new one (idempotent via source_ref). Updates by anyone else
--    are ignored — every login can write onboarding rows, and letters carry salary.
CREATE OR REPLACE FUNCTION public.hr_doc_link_issued_on_join()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d record; v_doc uuid; v_target uuid := NEW.employee_id;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Not a real employee: leave the letters where they are, never block the onboarding update.
  IF v_target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = v_target) THEN
    RETURN NEW;
  END IF;

  FOR d IN
    SELECT * FROM public.hr_documents_issued
     WHERE onboarding_id = NEW.id
       AND employee_id IS DISTINCT FROM v_target
  LOOP
    DELETE FROM public.hr_employee_documents
     WHERE source_ref = 'issued:' || d.id::text
       AND employee_id IS DISTINCT FROM v_target;
    UPDATE public.hr_documents_issued
       SET employee_id = v_target, employee_document_id = NULL
     WHERE id = d.id;

    IF v_target IS NOT NULL AND d.status IN ('issued', 'delivered')
       AND COALESCE(d.pdf_path, d.file_path) IS NOT NULL THEN
      v_doc := NULL;
      INSERT INTO public.hr_employee_documents
        (employee_id, document_type, document_name, file_url, uploaded_by, source, source_ref, notes)
      VALUES
        (v_target, 'hr_letter',
         COALESCE(d.reference_no, 'Letter') || ' — ' || COALESCE(d.template_name, 'HR letter'),
         'hr-doc-issued://' || COALESCE(d.pdf_path, d.file_path),
         d.issued_by_name, 'issued', 'issued:' || d.id::text,
         'Issued before joining; filed on joining')
      ON CONFLICT (employee_id, source_ref) DO NOTHING
      RETURNING id INTO v_doc;
      IF v_doc IS NULL THEN
        SELECT id INTO v_doc FROM public.hr_employee_documents
         WHERE employee_id = v_target AND source_ref = 'issued:' || d.id::text;
      END IF;
      UPDATE public.hr_documents_issued SET employee_document_id = v_doc WHERE id = d.id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_doc_link_issued_on_join() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hr_doc_link_issued_on_join ON public.hr_employee_onboarding;
CREATE TRIGGER trg_hr_doc_link_issued_on_join
  AFTER UPDATE OF employee_id ON public.hr_employee_onboarding
  FOR EACH ROW
  WHEN (NEW.employee_id IS DISTINCT FROM OLD.employee_id)
  EXECUTE FUNCTION public.hr_doc_link_issued_on_join();

-- 5b. A letter issued from an onboarding record that is already linked to an
--     employee (e.g. linked while HR had the generator open) belongs to that employee.
CREATE OR REPLACE FUNCTION public.hr_doc_issued_take_onboarding_employee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.onboarding_id IS NOT NULL AND NEW.employee_id IS NULL THEN
    SELECT o.employee_id INTO NEW.employee_id
      FROM public.hr_employee_onboarding o
     WHERE o.id = NEW.onboarding_id
       AND EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = o.employee_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_doc_issued_take_onboarding_employee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hr_doc_issued_take_onboarding_employee ON public.hr_documents_issued;
CREATE TRIGGER trg_hr_doc_issued_take_onboarding_employee
  BEFORE INSERT ON public.hr_documents_issued
  FOR EACH ROW EXECUTE FUNCTION public.hr_doc_issued_take_onboarding_employee();

-- 6. An employee can open a live letter that is linked to them but stored outside
--    their own folder (issued before joining, under candidates/<onboarding id>/).
CREATE OR REPLACE FUNCTION public.hr_doc_issued_object_is_mine(_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hr_documents_issued d
     WHERE d.employee_id IS NOT NULL
       AND d.employee_id = public.hr_ess_current_employee_id()
       AND d.status IN ('issued', 'delivered')
       AND _name IN (d.file_path, d.pdf_path)
  );
$$;
REVOKE ALL ON FUNCTION public.hr_doc_issued_object_is_mine(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_doc_issued_object_is_mine(text) TO authenticated;

DROP POLICY IF EXISTS "Employees read own linked issued letters" ON storage.objects;
CREATE POLICY "Employees read own linked issued letters" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'hr-doc-issued' AND public.hr_doc_issued_object_is_mine(name));

-- 7. The shared dictionary. Existing variables: candidate-neutral labels + aliases.
UPDATE public.hr_doc_field_catalog AS c SET
  label = v.label,
  aliases = v.aliases,
  description = COALESCE(c.description, v.description)
FROM (VALUES
  ('employee_name', 'Full Name', ARRAY['candidate_name','full_name','name','person_name'], 'Candidate (onboarding form) or employee — first + last name'),
  ('employee_first_name', 'First Name', ARRAY['candidate_first_name','first_name'], NULL),
  ('employee_badge_id', 'Employee ID / Badge', ARRAY['employee_id','badge_id','emp_id','employee_code'], NULL),
  ('employee_gender', 'Gender', ARRAY['gender','candidate_gender'], NULL),
  ('employee_address', 'Address', ARRAY['candidate_address','address'], NULL),
  ('employee_phone', 'Mobile', ARRAY['candidate_mobile','candidate_phone','mobile','phone','mobile_no','phone_number'], NULL),
  ('employee_email', 'Email', ARRAY['candidate_email','email','email_id'], NULL),
  ('employee_pan', 'PAN Number', ARRAY['pan','pan_number'], NULL),
  ('designation', 'Designation', ARRAY['position','job_title','role'], NULL),
  ('department', 'Department', ARRAY['dept'], NULL),
  ('date_of_joining', 'Date of Joining', ARRAY['doj','joining_date','start_date'], NULL),
  ('last_working_day', 'Last Working Day', ARRAY['lwd','relieving_date'], NULL),
  ('employment_type', 'Employment Type', ARRAY['employee_type'], 'Permanent → "Full-time, permanent"; Contract; Intern → "Internship"'),
  ('reporting_manager', 'Reporting Manager', ARRAY['manager','reports_to'], NULL),
  ('work_location', 'Work Location', ARRAY['place_of_posting','location','posting_location'], 'Defaults to the head office when the record has none'),
  ('annual_ctc', 'Annual CTC', ARRAY['ctc','ctc_annual','yearly_ctc'], 'Printed as "INR 1,63,200". Candidates: post-training CTC, else CTC'),
  ('annual_ctc_words', 'Annual CTC in Words (… Rupees Only)', ARRAY['ctc_words'], 'Ends with "Rupees Only"'),
  ('monthly_ctc', 'Monthly CTC (annual ÷ 12)', ARRAY['ctc_monthly'], 'Printed as "INR 13,600"'),
  ('sign', 'Signature', ARRAY['signature','authorised_signature','signatory_signature'], NULL),
  ('signatory_name', 'Signatory Name', ARRAY['hr_name','authorised_signatory','signatory'], NULL),
  ('signatory_designation', 'Signatory Designation', ARRAY['hr_designation','authorised_signatory_designation'], NULL),
  ('seal', 'Company Seal', ARRAY['company_seal','stamp'], NULL),
  ('letter_date', 'Letter Date', ARRAY['offer_date','date','issue_date','letter_issue_date'], 'Today (IST); editable before issuing'),
  ('reference_no', 'Reference Number', ARRAY['ref_no','offer_ref_no','reference_number','ref_number','letter_ref_no','ref'], 'Allocated when the letter is issued'),
  ('generated_by', 'Generated By', ARRAY['issued_by'], NULL)
) AS v(field_key, label, aliases, description)
WHERE c.field_key = v.field_key;

UPDATE public.hr_doc_field_catalog
   SET default_value = 'Bhopal, Madhya Pradesh'
 WHERE field_key = 'work_location' AND default_value IS NULL;

-- New variables (offer letter and any future template).
INSERT INTO public.hr_doc_field_catalog
  (field_key, label, field_group, data_type, formatter, resolver_id, description, is_sensitive, default_value, sort_order, aliases)
VALUES
  ('shift', 'Shift', 'employment', 'text', NULL, 'employment.shift', 'Name and hours, e.g. "Morning Shift (09:00 to 17:00)"; a trainee''s shift after training', false, NULL, 39, ARRAY['shift_timing','shift_name','work_shift']),
  ('annual_ctc_in_words', 'Annual CTC in Words (no "Rupees … Only")', 'salary', 'text', 'indian_words_plain', 'derived.annual_ctc_words', 'Bare words for templates that print "Rupees … only" themselves', true, NULL, 53, ARRAY['ctc_in_words']),
  ('basic_monthly', 'Basic Salary — monthly', 'salary', 'currency', NULL, 'salary.basic_monthly', 'Standard structure share of the CTC', true, NULL, 54, ARRAY['basic_salary_monthly','basic_pm']),
  ('basic_annual', 'Basic Salary — yearly', 'salary', 'currency', NULL, 'salary.basic_annual', 'Standard structure share of the CTC', true, NULL, 55, ARRAY['basic_salary_annual','basic_yearly','basic_pa']),
  ('da_monthly', 'DA — monthly', 'salary', 'currency', NULL, 'salary.da_monthly', 'Standard structure share of the CTC', true, NULL, 56, ARRAY['dearness_allowance_monthly']),
  ('da_annual', 'DA — yearly', 'salary', 'currency', NULL, 'salary.da_annual', 'Standard structure share of the CTC', true, NULL, 57, ARRAY['da_yearly','dearness_allowance_annual']),
  ('hra_monthly', 'HRA — monthly', 'salary', 'currency', NULL, 'salary.hra_monthly', 'Standard structure share of the CTC', true, NULL, 58, ARRAY['hra_pm']),
  ('hra_annual', 'HRA — yearly', 'salary', 'currency', NULL, 'salary.hra_annual', 'Standard structure share of the CTC', true, NULL, 59, ARRAY['hra_yearly','hra_pa']),
  ('special_allowance_monthly', 'Special Allowance — monthly', 'salary', 'currency', NULL, 'salary.special_allowance_monthly', 'Standard structure share of the CTC; absorbs rounding so the columns total the CTC', true, NULL, 60, ARRAY['special_monthly','sa_monthly']),
  ('special_allowance_annual', 'Special Allowance — yearly', 'salary', 'currency', NULL, 'salary.special_allowance_annual', 'Standard structure share of the CTC; absorbs rounding so the columns total the CTC', true, NULL, 61, ARRAY['special_annual','special_allowance_yearly','sa_annual']),
  ('lta_monthly', 'LTA — monthly', 'salary', 'currency', NULL, 'salary.lta_monthly', 'Standard structure share of the CTC', true, NULL, 62, ARRAY['lta_pm']),
  ('lta_annual', 'LTA — yearly', 'salary', 'currency', NULL, 'salary.lta_annual', 'Standard structure share of the CTC', true, NULL, 63, ARRAY['lta_yearly','lta_pa']),
  ('probation_period', 'Probation Period', 'terms', 'text', NULL, 'terms.probation_period', 'From the person''s probation end date, else the offer-letter policy (months)', false, NULL, 80, ARRAY['probation','probation_duration']),
  ('probation_extension', 'Probation Extension (maximum)', 'terms', 'text', NULL, NULL, 'Asked while generating unless a default is set here, e.g. "3 months"', false, NULL, 81, ARRAY['probation_extension_period']),
  ('notice_period_probation', 'Notice Period during Probation', 'terms', 'text', NULL, 'terms.notice_period_probation', 'Offer-letter policy, e.g. "15 days"', false, NULL, 82, ARRAY['notice_during_probation','probation_notice_period']),
  ('notice_period_confirmed', 'Notice Period after Confirmation', 'terms', 'text', NULL, 'terms.notice_period_confirmed', 'Offer-letter policy, e.g. "30 days"', false, NULL, 83, ARRAY['notice_period','notice_after_confirmation','confirmed_notice_period'])
ON CONFLICT (field_key) DO NOTHING;