-- ============================================================================
-- LMS (HRMS → LMS): KRA-based training library, seats, training plans and
-- per-KRA certification. New lms_* objects only; no existing table, function
-- or policy is changed.
-- Access: everyone with HRMS access gets LMS through permission implications;
-- hrms_lms_view / hrms_lms_manage can also be granted alone (e.g. the trainer).
-- ============================================================================

-- ---------- permissions ----------
INSERT INTO public.permission_implications (parent_permission, child_permission) VALUES
  ('hrms_view', 'hrms_lms_view'),
  ('hrms_manage', 'hrms_lms_manage'),
  ('hrms_lms_manage', 'hrms_lms_view')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.lms_can_view(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id, 'hrms_lms_view') OR public.has_permission(_user_id, 'hrms_lms_manage')
    OR public.has_role(_user_id, 'super admin') OR public.has_role(_user_id, 'admin'))
$$;

CREATE OR REPLACE FUNCTION public.lms_can_manage(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id, 'hrms_lms_manage')
    OR public.has_role(_user_id, 'super admin') OR public.has_role(_user_id, 'admin'))
$$;

REVOKE EXECUTE ON FUNCTION public.lms_can_view(uuid), public.lms_can_manage(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.lms_can_view(uuid), public.lms_can_manage(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lms_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- settings (single row) ----------
CREATE TABLE public.lms_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  programme_days integer NOT NULL DEFAULT 30 CHECK (programme_days BETWEEN 1 AND 180),
  module_days integer NOT NULL DEFAULT 15 CHECK (module_days BETWEEN 1 AND 180),
  test_days integer[] NOT NULL DEFAULT '{8,15}',
  pass_mark integer NOT NULL DEFAULT 80 CHECK (pass_mark BETWEEN 1 AND 100),
  extension_days integer NOT NULL DEFAULT 5 CHECK (extension_days BETWEEN 0 AND 60),
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  default_language text NOT NULL DEFAULT 'en' CHECK (default_language IN ('en', 'hinglish')),
  catalogue_version text,
  catalogue_imported_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.lms_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------- KRA catalogue (imported) ----------
CREATE TABLE public.lms_kras (
  code text PRIMARY KEY,
  name text NOT NULL,
  department_code text NOT NULL,
  department_name text NOT NULL,
  subdepartment_code text NOT NULL,
  subdepartment_name text NOT NULL,
  layer_code text NOT NULL,
  layer_name text NOT NULL,
  platform text CHECK (platform IN ('Binance', 'KuCoin', 'Bitget')),
  catalogue_status text NOT NULL DEFAULT 'live' CHECK (catalogue_status IN ('live', 'partial', 'notlive', 'planned', 'future')),
  description text,
  description_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lms_kras_department_idx ON public.lms_kras (department_code, subdepartment_code, sort_order);

-- ---------- modules ----------
CREATE TABLE public.lms_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  module_type text NOT NULL CHECK (module_type IN ('company', 'department', 'subdepartment', 'platform', 'shared', 'companywide', 'kra')),
  department_code text,
  subdepartment_code text,
  platform text CHECK (platform IN ('Binance', 'KuCoin', 'Bitget')),
  summary text,
  content_md text,
  trainer_notes text,
  duration_minutes integer NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 5 AND 600),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'drafting', 'in_review', 'approved', 'retired')),
  production jsonb NOT NULL DEFAULT '{}'::jsonb,
  version text NOT NULL DEFAULT '1.0',
  version_notes text,
  version_published_at timestamptz,
  quiz_tag text,
  owner_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX lms_modules_type_idx ON public.lms_modules (module_type, department_code, subdepartment_code, sort_order);

CREATE TABLE public.lms_module_kras (
  module_id uuid NOT NULL REFERENCES public.lms_modules(id) ON DELETE CASCADE,
  kra_code text NOT NULL REFERENCES public.lms_kras(code) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (module_id, kra_code)
);
CREATE INDEX lms_module_kras_kra_idx ON public.lms_module_kras (kra_code);

CREATE TABLE public.lms_module_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.lms_modules(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('video', 'slides', 'booklet', 'job_aid', 'screen_recording', 'trainer_guide', 'image', 'other')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hinglish', 'both')),
  title text NOT NULL,
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes bigint,
  version text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT lms_module_assets_source_chk CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);
CREATE INDEX lms_module_assets_module_idx ON public.lms_module_assets (module_id, sort_order);

CREATE TABLE public.lms_module_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.lms_modules(id) ON DELETE CASCADE,
  item text NOT NULL,
  is_critical boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lms_module_checklist_module_idx ON public.lms_module_checklist (module_id, sort_order);

-- ---------- seats (KRA bundles) ----------
CREATE TABLE public.lms_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  department_code text,
  position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.lms_seat_kras (
  seat_id uuid NOT NULL REFERENCES public.lms_seats(id) ON DELETE CASCADE,
  kra_code text NOT NULL REFERENCES public.lms_kras(code) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (seat_id, kra_code)
);

-- ---------- training plans ----------
CREATE TABLE public.lms_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  seat_id uuid REFERENCES public.lms_seats(id) ON DELETE SET NULL,
  plan_type text NOT NULL DEFAULT 'induction' CHECK (plan_type IN ('induction', 'reskilling', 'refresher')),
  title text NOT NULL,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hinglish')),
  start_date date NOT NULL,
  module_days integer NOT NULL CHECK (module_days BETWEEN 1 AND 180),
  total_days integer NOT NULL CHECK (total_days BETWEEN 1 AND 240),
  extension_days integer NOT NULL DEFAULT 0 CHECK (extension_days BETWEEN 0 AND 120),
  trainer_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  supervisor_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'failed', 'cancelled')),
  outcome text CHECK (outcome IN ('certified', 'partially_certified', 'exit_recommended', 'withdrawn')),
  notes text,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX lms_plans_employee_idx ON public.lms_plans (employee_id);
CREATE INDEX lms_plans_status_idx ON public.lms_plans (status);

CREATE TABLE public.lms_plan_kras (
  plan_id uuid NOT NULL REFERENCES public.lms_plans(id) ON DELETE CASCADE,
  kra_code text NOT NULL REFERENCES public.lms_kras(code) ON UPDATE CASCADE,
  status text NOT NULL DEFAULT 'in_training' CHECK (status IN ('in_training', 'certified', 'not_cleared')),
  decided_at timestamptz,
  decided_by uuid,
  remarks text,
  PRIMARY KEY (plan_id, kra_code)
);
CREATE INDEX lms_plan_kras_kra_idx ON public.lms_plan_kras (kra_code);

CREATE TABLE public.lms_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.lms_plans(id) ON DELETE CASCADE,
  day_no integer NOT NULL CHECK (day_no BETWEEN 1 AND 240),
  sort_order integer NOT NULL DEFAULT 0,
  item_type text NOT NULL CHECK (item_type IN ('module', 'test', 'practice', 'live', 'note')),
  module_id uuid REFERENCES public.lms_modules(id) ON DELETE SET NULL,
  module_version text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  completed_at timestamptz,
  demo_done boolean NOT NULL DEFAULT false,
  signoff_result text CHECK (signoff_result IN ('passed', 'failed')),
  signoff_by_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  signoff_at timestamptz,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_kind text CHECK (test_kind IN ('mid', 'final', 'retest')),
  test_attempt integer,
  score_pct numeric(5, 2) CHECK (score_pct IS NULL OR (score_pct >= 0 AND score_pct <= 100)),
  critical_ok boolean,
  test_passed boolean,
  quiz_reference text,
  live_orders integer CHECK (live_orders IS NULL OR live_orders >= 0),
  live_errors integer CHECK (live_errors IS NULL OR live_errors >= 0),
  live_critical_error boolean,
  remarks text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lms_plan_items_plan_idx ON public.lms_plan_items (plan_id, day_no, sort_order);
CREATE INDEX lms_plan_items_module_idx ON public.lms_plan_items (module_id);

-- ---------- certifications (one row per employee and KRA) ----------
CREATE TABLE public.lms_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  kra_code text NOT NULL REFERENCES public.lms_kras(code) ON UPDATE CASCADE,
  plan_id uuid REFERENCES public.lms_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'certified' CHECK (status IN ('certified', 'refresher_due', 'revoked')),
  certified_at timestamptz NOT NULL DEFAULT now(),
  certified_by uuid,
  module_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lms_certifications_employee_kra_key UNIQUE (employee_id, kra_code)
);
CREATE INDEX lms_certifications_kra_idx ON public.lms_certifications (kra_code);

-- ---------- updated_at triggers ----------
CREATE TRIGGER lms_settings_touch BEFORE UPDATE ON public.lms_settings FOR EACH ROW EXECUTE FUNCTION public.lms_touch_updated_at();
CREATE TRIGGER lms_kras_touch BEFORE UPDATE ON public.lms_kras FOR EACH ROW EXECUTE FUNCTION public.lms_touch_updated_at();
CREATE TRIGGER lms_modules_touch BEFORE UPDATE ON public.lms_modules FOR EACH ROW EXECUTE FUNCTION public.lms_touch_updated_at();
CREATE TRIGGER lms_seats_touch BEFORE UPDATE ON public.lms_seats FOR EACH ROW EXECUTE FUNCTION public.lms_touch_updated_at();
CREATE TRIGGER lms_plans_touch BEFORE UPDATE ON public.lms_plans FOR EACH ROW EXECUTE FUNCTION public.lms_touch_updated_at();
CREATE TRIGGER lms_plan_items_touch BEFORE UPDATE ON public.lms_plan_items FOR EACH ROW EXECUTE FUNCTION public.lms_touch_updated_at();
CREATE TRIGGER lms_certifications_touch BEFORE UPDATE ON public.lms_certifications FOR EACH ROW EXECUTE FUNCTION public.lms_touch_updated_at();

-- ---------- grants, RLS, policies (same four steps for every table) ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lms_settings', 'lms_kras', 'lms_modules', 'lms_module_kras', 'lms_module_assets',
                           'lms_module_checklist', 'lms_seats', 'lms_seat_kras', 'lms_plans', 'lms_plan_kras',
                           'lms_plan_items', 'lms_certifications']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "LMS viewers read" ON public.%I FOR SELECT TO authenticated USING (public.lms_can_view(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "LMS managers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.lms_can_manage(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "LMS managers update" ON public.%I FOR UPDATE TO authenticated USING (public.lms_can_manage(auth.uid())) WITH CHECK (public.lms_can_manage(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "LMS managers delete" ON public.%I FOR DELETE TO authenticated USING (public.lms_can_manage(auth.uid()))', t);
  END LOOP;
END $$;

-- ---------- private storage for module files ----------
-- The private 'lms-content' bucket itself (500 MB per file) is created with the bucket tool, not in SQL.
CREATE POLICY "LMS viewers read lms-content" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lms-content' AND public.lms_can_view(auth.uid()));
CREATE POLICY "LMS managers upload lms-content" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lms-content' AND public.lms_can_manage(auth.uid()));
CREATE POLICY "LMS managers update lms-content" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lms-content' AND public.lms_can_manage(auth.uid()))
  WITH CHECK (bucket_id = 'lms-content' AND public.lms_can_manage(auth.uid()));
CREATE POLICY "LMS managers delete lms-content" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lms-content' AND public.lms_can_manage(auth.uid()));

-- ---------- employee list for LMS users (names and posts only, no pay data) ----------
CREATE OR REPLACE FUNCTION public.lms_employee_directory()
RETURNS TABLE (id uuid, full_name text, badge_id text, is_active boolean, department_name text,
               position_title text, joining_date date, training_completion_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id,
         trim(concat_ws(' ', e.first_name, e.last_name)) AS full_name,
         e.badge_id,
         coalesce(e.is_active, false) AS is_active,
         w.department_name,
         w.position_title,
         w.joining_date,
         ob.training_completion_date
  FROM public.hr_employees e
  LEFT JOIN LATERAL (
    SELECT d.name AS department_name, p.title AS position_title, wi.joining_date
    FROM public.hr_employee_work_info wi
    LEFT JOIN public.departments d ON d.id = wi.department_id
    LEFT JOIN public.positions p ON p.id = wi.job_position_id
    WHERE wi.employee_id = e.id
    ORDER BY wi.updated_at DESC NULLS LAST
    LIMIT 1
  ) w ON true
  LEFT JOIN LATERAL (
    SELECT o.training_completion_date
    FROM public.hr_employee_onboarding o
    WHERE o.employee_id = e.id
    ORDER BY o.created_at DESC NULLS LAST
    LIMIT 1
  ) ob ON true
  WHERE public.lms_can_view(auth.uid())
  ORDER BY coalesce(e.is_active, false) DESC, 2
$$;
REVOKE EXECUTE ON FUNCTION public.lms_employee_directory() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lms_employee_directory() TO authenticated, service_role;

-- ---------- catalogue import (upsert KRAs and modules from the KRA catalogue file) ----------
-- Never deletes: KRAs and modules missing from the file are marked inactive, so plans,
-- certifications and module content stay intact. Module content, status, versions and
-- files are never overwritten by an import.
CREATE OR REPLACE FUNCTION public.lms_import_catalogue(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kras integer := 0;
  v_modules integer := 0;
  v_links integer := 0;
  v_kras_off integer := 0;
  v_modules_off integer := 0;
BEGIN
  IF NOT public.lms_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: LMS manage permission required';
  END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload -> 'kras') IS DISTINCT FROM 'array'
     OR jsonb_typeof(_payload -> 'modules') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a KRA catalogue file: expected "kras" and "modules" lists';
  END IF;

  INSERT INTO public.lms_kras AS t (code, name, department_code, department_name, subdepartment_code, subdepartment_name,
                                    layer_code, layer_name, platform, catalogue_status, description, description_url,
                                    sort_order, is_active)
  SELECT k.code, k.name, k.department_code, k.department_name, k.subdepartment_code, k.subdepartment_name,
         k.layer_code, k.layer_name, k.platform, coalesce(k.catalogue_status, 'live'), k.description, k.description_url,
         coalesce(k.sort_order, 0), true
  FROM jsonb_to_recordset(_payload -> 'kras') AS k(code text, name text, department_code text, department_name text,
       subdepartment_code text, subdepartment_name text, layer_code text, layer_name text, platform text,
       catalogue_status text, description text, description_url text, sort_order integer)
  WHERE k.code IS NOT NULL AND k.name IS NOT NULL
  ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name, department_code = EXCLUDED.department_code, department_name = EXCLUDED.department_name,
    subdepartment_code = EXCLUDED.subdepartment_code, subdepartment_name = EXCLUDED.subdepartment_name,
    layer_code = EXCLUDED.layer_code, layer_name = EXCLUDED.layer_name, platform = EXCLUDED.platform,
    catalogue_status = EXCLUDED.catalogue_status, description = EXCLUDED.description,
    description_url = EXCLUDED.description_url, sort_order = EXCLUDED.sort_order, is_active = true;
  GET DIAGNOSTICS v_kras = ROW_COUNT;

  UPDATE public.lms_kras SET is_active = false
  WHERE is_active AND code NOT IN (SELECT x ->> 'code' FROM jsonb_array_elements(_payload -> 'kras') x WHERE x ->> 'code' IS NOT NULL);
  GET DIAGNOSTICS v_kras_off = ROW_COUNT;

  INSERT INTO public.lms_modules AS t (code, title, module_type, department_code, subdepartment_code, platform, summary,
                                       sort_order, quiz_tag, is_active)
  SELECT m.code, m.title, m.module_type, m.department_code, m.subdepartment_code, m.platform, m.summary,
         coalesce(m.sort_order, 0), m.code, true
  FROM jsonb_to_recordset(_payload -> 'modules') AS m(code text, title text, module_type text, department_code text,
       subdepartment_code text, platform text, summary text, sort_order integer)
  WHERE m.code IS NOT NULL AND m.title IS NOT NULL
  ON CONFLICT (code) DO UPDATE SET
    title = EXCLUDED.title, module_type = EXCLUDED.module_type, department_code = EXCLUDED.department_code,
    subdepartment_code = EXCLUDED.subdepartment_code, platform = EXCLUDED.platform,
    summary = coalesce(t.summary, EXCLUDED.summary), sort_order = EXCLUDED.sort_order,
    quiz_tag = coalesce(t.quiz_tag, EXCLUDED.quiz_tag), is_active = true;
  GET DIAGNOSTICS v_modules = ROW_COUNT;

  UPDATE public.lms_modules SET is_active = false
  WHERE is_active AND code NOT IN (SELECT x ->> 'code' FROM jsonb_array_elements(_payload -> 'modules') x WHERE x ->> 'code' IS NOT NULL);
  GET DIAGNOSTICS v_modules_off = ROW_COUNT;

  DELETE FROM public.lms_module_kras mk
  USING public.lms_modules m
  WHERE mk.module_id = m.id
    AND m.code IN (SELECT x ->> 'code' FROM jsonb_array_elements(_payload -> 'modules') x WHERE x ->> 'code' IS NOT NULL);

  INSERT INTO public.lms_module_kras (module_id, kra_code)
  SELECT DISTINCT m.id, kc.code
  FROM jsonb_array_elements(_payload -> 'modules') x
  JOIN public.lms_modules m ON m.code = x ->> 'code'
  CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(x -> 'kra_codes', '[]'::jsonb)) AS kc(code)
  WHERE EXISTS (SELECT 1 FROM public.lms_kras k WHERE k.code = kc.code)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_links = ROW_COUNT;

  UPDATE public.lms_settings
  SET catalogue_version = _payload ->> 'version', catalogue_imported_at = now(), updated_by = auth.uid()
  WHERE id;

  RETURN jsonb_build_object('kras', v_kras, 'modules', v_modules, 'links', v_links,
                            'kras_deactivated', v_kras_off, 'modules_deactivated', v_modules_off);
END $$;
REVOKE EXECUTE ON FUNCTION public.lms_import_catalogue(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lms_import_catalogue(jsonb) TO authenticated, service_role;
