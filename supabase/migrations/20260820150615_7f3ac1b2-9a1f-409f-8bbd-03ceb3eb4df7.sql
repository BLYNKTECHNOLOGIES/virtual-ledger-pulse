
ALTER TABLE public.hr_employee_documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'hr_upload',
  ADD COLUMN IF NOT EXISTS source_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS hr_employee_documents_source_ref_uidx
  ON public.hr_employee_documents (employee_id, source_ref);

-- ── Sync onboarding jsonb document files into hr_employee_documents ──
CREATE OR REPLACE FUNCTION public.hr_sync_onboarding_documents(p_onboarding_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_onb record;
  k text;
  v jsonb;
  f jsonb;
  v_url text;
  v_name text;
  v_count int := 0;
  v_ref text;
BEGIN
  SELECT * INTO r_onb FROM public.hr_employee_onboarding WHERE id = p_onboarding_id;
  IF NOT FOUND OR r_onb.employee_id IS NULL THEN RETURN 0; END IF;

  FOR k, v IN
    SELECT * FROM jsonb_each(COALESCE(r_onb.documents, '{}'::jsonb))
    UNION ALL
    SELECT * FROM jsonb_each(COALESCE(r_onb.offer_policy_documents, '{}'::jsonb))
  LOOP
    IF jsonb_typeof(v) <> 'object' THEN CONTINUE; END IF;

    v_url := NULLIF(v->>'file_url', '');
    IF v_url IS NOT NULL THEN
      v_name := COALESCE(NULLIF(v->>'file_name',''), replace(initcap(replace(k,'_',' ')),'  ',' '));
      v_ref := 'onboarding:' || p_onboarding_id::text || ':' || k;
      INSERT INTO public.hr_employee_documents
        (employee_id, document_type, document_name, file_url, uploaded_by, source, source_ref, notes)
      VALUES
        (r_onb.employee_id, k, v_name, v_url, 'Onboarding submission', 'onboarding', v_ref,
         'Collected during onboarding')
      ON CONFLICT (employee_id, source_ref) DO UPDATE
        SET file_url = EXCLUDED.file_url,
            document_name = EXCLUDED.document_name;
      v_count := v_count + 1;
    END IF;


    IF jsonb_typeof(v->'extra_files') = 'array' THEN
      FOR f IN SELECT * FROM jsonb_array_elements(v->'extra_files')
      LOOP
        v_url := NULLIF(f->>'file_url', '');
        CONTINUE WHEN v_url IS NULL;
        v_name := COALESCE(NULLIF(f->>'file_name',''), initcap(replace(k,'_',' ')));
        v_ref := 'onboarding:' || p_onboarding_id::text || ':' || k || ':' || md5(v_url);
        INSERT INTO public.hr_employee_documents
          (employee_id, document_type, document_name, file_url, uploaded_by, source, source_ref, notes)
        VALUES
          (r_onb.employee_id, k, v_name, v_url, 'Onboarding submission', 'onboarding', v_ref,
           'Collected during onboarding')
        ON CONFLICT (employee_id, source_ref) DO UPDATE
          SET file_url = EXCLUDED.file_url,
              document_name = EXCLUDED.document_name;
        v_count := v_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_onboarding_documents_sync_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    PERFORM public.hr_sync_onboarding_documents(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_onboarding_documents_sync ON public.hr_employee_onboarding;
CREATE TRIGGER trg_hr_onboarding_documents_sync
AFTER INSERT OR UPDATE OF documents, offer_policy_documents, employee_id
ON public.hr_employee_onboarding
FOR EACH ROW EXECUTE FUNCTION public.hr_onboarding_documents_sync_trg();

-- Backfill existing onboarding records
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.hr_employee_onboarding WHERE employee_id IS NOT NULL LOOP
    PERFORM public.hr_sync_onboarding_documents(r.id);
  END LOOP;
END $$;

-- ── Access rules: HR staff (role is "HR Manager") ──
DROP POLICY IF EXISTS "Admin/HR can view employee documents" ON public.hr_employee_documents;
DROP POLICY IF EXISTS "Admin/HR can insert employee documents" ON public.hr_employee_documents;
DROP POLICY IF EXISTS "Admin/HR can update employee documents" ON public.hr_employee_documents;
DROP POLICY IF EXISTS "Admin/HR can delete employee documents" ON public.hr_employee_documents;

CREATE POLICY "HR staff can view employee documents"
  ON public.hr_employee_documents FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can insert employee documents"
  ON public.hr_employee_documents FOR INSERT TO authenticated
  WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can update employee documents"
  ON public.hr_employee_documents FOR UPDATE TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()))
  WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff can delete employee documents"
  ON public.hr_employee_documents FOR DELETE TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employee_documents TO authenticated;
GRANT ALL ON public.hr_employee_documents TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_sync_onboarding_documents(uuid) TO authenticated, service_role;
