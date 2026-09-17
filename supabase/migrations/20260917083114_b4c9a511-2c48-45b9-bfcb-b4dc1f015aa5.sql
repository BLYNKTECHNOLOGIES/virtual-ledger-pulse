-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.cbt_section_type AS ENUM ('typing','data_entry','match_pairs','objective','written');
  CREATE TYPE public.cbt_question_type AS ENUM ('mcq','numeric','sjt','written','typing_passage','data_entry_record','match_pair');
  CREATE TYPE public.cbt_difficulty AS ENUM ('easy','medium','hard');
  CREATE TYPE public.cbt_question_status AS ENUM ('draft','needs_review','approved','retired');
  CREATE TYPE public.cbt_drive_mode AS ENUM ('on_site','remote');
  CREATE TYPE public.cbt_drive_status AS ENUM ('draft','live','closed');
  CREATE TYPE public.cbt_candidate_source AS ENUM ('Indeed','Walk-in','Referral','LinkedIn','Company website','Other');
  CREATE TYPE public.cbt_attempt_status AS ENUM ('registered','in_progress','submitted','auto_submitted','abandoned','invalidated');
  CREATE TYPE public.cbt_section_status AS ENUM ('pending','in_progress','submitted','auto_submitted');
  CREATE TYPE public.cbt_decision AS ENUM ('pending_evaluation','shortlisted','hold','rejected','incomplete');
  CREATE TYPE public.cbt_decision_source AS ENUM ('auto','manual');
  CREATE TYPE public.cbt_proctor_event_type AS ENUM ('fullscreen_exit','tab_hidden','window_blur','paste_blocked','copy_blocked','shortcut_blocked','burst_input','resume','second_session');
  CREATE TYPE public.cbt_warning_action AS ENUM ('flag_only','auto_submit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ ACCESS HELPERS ============
CREATE OR REPLACE FUNCTION public.cbt_can_view(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id,'hrms_quiz_view') OR public.has_permission(_user_id,'hrms_quiz_manage')
    OR public.has_permission(_user_id,'hrms_quiz_admin') OR public.has_permission(_user_id,'super_admin_access'))
$$;
CREATE OR REPLACE FUNCTION public.cbt_can_manage(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id,'hrms_quiz_manage') OR public.has_permission(_user_id,'hrms_quiz_admin')
    OR public.has_permission(_user_id,'super_admin_access'))
$$;
CREATE OR REPLACE FUNCTION public.cbt_can_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id,'hrms_quiz_admin') OR public.has_permission(_user_id,'super_admin_access'))
$$;
CREATE OR REPLACE FUNCTION public.cbt_can_evaluate(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id,'hrms_quiz_evaluate') OR public.has_permission(_user_id,'hrms_quiz_manage')
    OR public.has_permission(_user_id,'hrms_quiz_admin') OR public.has_permission(_user_id,'super_admin_access'))
$$;
REVOKE EXECUTE ON FUNCTION public.cbt_can_view(uuid), public.cbt_can_manage(uuid), public.cbt_can_admin(uuid), public.cbt_can_evaluate(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.cbt_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============ SETTINGS ============
CREATE TABLE public.cbt_settings (
  id boolean PRIMARY KEY DEFAULT true,
  company_name text NOT NULL DEFAULT 'Blynk Virtual Technologies Pvt. Ltd.',
  brand_name text NOT NULL DEFAULT 'BlynkEx',
  logo_url text,
  privacy_url text NOT NULL DEFAULT 'https://www.blynkex.com/privacy',
  terms_url text NOT NULL DEFAULT 'https://www.blynkex.com/terms',
  hr_email text NOT NULL DEFAULT 'hr.desk@blynkex.com',
  retention_days int NOT NULL DEFAULT 180,
  max_warnings int NOT NULL DEFAULT 3,
  on_warning_limit public.cbt_warning_action NOT NULL DEFAULT 'flag_only',
  heartbeat_seconds int NOT NULL DEFAULT 15,
  abandon_after_minutes int NOT NULL DEFAULT 20,
  transition_seconds int NOT NULL DEFAULT 60,
  deadline_grace_seconds int NOT NULL DEFAULT 5,
  typing_practice_passage text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cbt_settings_single_row CHECK (id)
);
GRANT SELECT ON public.cbt_settings TO authenticated;
GRANT ALL ON public.cbt_settings TO service_role;
ALTER TABLE public.cbt_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_settings_read ON public.cbt_settings FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_settings_touch BEFORE UPDATE ON public.cbt_settings FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

-- ============ DEPARTMENTS / ROLES / BLUEPRINTS ============
CREATE TABLE public.cbt_departments (
  code text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_departments TO authenticated;
GRANT ALL ON public.cbt_departments TO service_role;
ALTER TABLE public.cbt_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_departments_read ON public.cbt_departments FOR SELECT TO authenticated USING (public.cbt_can_view());

CREATE TABLE public.cbt_job_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  department_code text NOT NULL REFERENCES public.cbt_departments(code),
  erp_position_aliases text[] NOT NULL DEFAULT '{}',
  level int NOT NULL DEFAULT 5,
  shortlist_cutoff numeric NOT NULL DEFAULT 65,
  hold_cutoff numeric NOT NULL DEFAULT 50,
  retake_cooldown_days int NOT NULL DEFAULT 90,
  difficulty_mix jsonb NOT NULL DEFAULT '{"easy":40,"medium":40,"hard":20}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_job_roles TO authenticated;
GRANT ALL ON public.cbt_job_roles TO service_role;
ALTER TABLE public.cbt_job_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_job_roles_read ON public.cbt_job_roles FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_job_roles_touch BEFORE UPDATE ON public.cbt_job_roles FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

CREATE TABLE public.cbt_role_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_role_id uuid NOT NULL REFERENCES public.cbt_job_roles(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  section_code text NOT NULL,
  section_type public.cbt_section_type NOT NULL,
  title text NOT NULL,
  category_tags text[] NOT NULL DEFAULT '{}',
  item_count int NOT NULL DEFAULT 1,
  duration_seconds int NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  negative_mark numeric NOT NULL DEFAULT 0,
  gate_min_score numeric,
  gate_min_net_wpm numeric,
  gate_min_accuracy numeric,
  full_marks_wpm numeric,
  practice_seconds int NOT NULL DEFAULT 0,
  min_words int,
  max_words int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_role_id, order_index)
);
GRANT SELECT ON public.cbt_role_sections TO authenticated;
GRANT ALL ON public.cbt_role_sections TO service_role;
ALTER TABLE public.cbt_role_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_role_sections_read ON public.cbt_role_sections FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_role_sections_touch BEFORE UPDATE ON public.cbt_role_sections FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

-- ============ QUESTION BANK ============
CREATE TABLE public.cbt_stimuli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  status public.cbt_question_status NOT NULL DEFAULT 'needs_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_stimuli TO authenticated;
GRANT ALL ON public.cbt_stimuli TO service_role;
ALTER TABLE public.cbt_stimuli ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_stimuli_read ON public.cbt_stimuli FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_stimuli_touch BEFORE UPDATE ON public.cbt_stimuli FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

CREATE TABLE public.cbt_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.cbt_question_type NOT NULL,
  category_tag text NOT NULL,
  difficulty public.cbt_difficulty NOT NULL DEFAULT 'medium',
  stimulus_id uuid REFERENCES public.cbt_stimuli(id) ON DELETE SET NULL,
  status public.cbt_question_status NOT NULL DEFAULT 'draft',
  current_version_id uuid,
  applicable_role_codes text[],
  times_served int NOT NULL DEFAULT 0,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_questions TO authenticated;
GRANT ALL ON public.cbt_questions TO service_role;
ALTER TABLE public.cbt_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_questions_read ON public.cbt_questions FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_questions_touch BEFORE UPDATE ON public.cbt_questions FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();
CREATE INDEX idx_cbt_questions_tag ON public.cbt_questions (category_tag, status, difficulty);

CREATE TABLE public.cbt_question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  version_no int NOT NULL DEFAULT 1,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_served_at timestamptz,
  UNIQUE (question_id, version_no)
);
GRANT SELECT ON public.cbt_question_versions TO authenticated;
GRANT ALL ON public.cbt_question_versions TO service_role;
ALTER TABLE public.cbt_question_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_question_versions_read ON public.cbt_question_versions FOR SELECT TO authenticated USING (public.cbt_can_view());
ALTER TABLE public.cbt_questions ADD CONSTRAINT cbt_questions_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.cbt_question_versions(id) ON DELETE SET NULL;

CREATE TABLE public.cbt_question_keys (
  question_version_id uuid PRIMARY KEY REFERENCES public.cbt_question_versions(id) ON DELETE CASCADE,
  correct_option_id text,
  numeric_answer numeric,
  numeric_tolerance numeric NOT NULL DEFAULT 0,
  sjt_scores jsonb,
  red_flag_option_ids text[] NOT NULL DEFAULT '{}',
  pair_is_match boolean,
  rubric jsonb,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_question_keys TO authenticated;
GRANT ALL ON public.cbt_question_keys TO service_role;
ALTER TABLE public.cbt_question_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_question_keys_read ON public.cbt_question_keys FOR SELECT TO authenticated USING (public.cbt_can_manage());
CREATE TRIGGER trg_cbt_question_keys_touch BEFORE UPDATE ON public.cbt_question_keys FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

-- ============ DRIVES / CANDIDATES ============
CREATE TABLE public.cbt_drives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  access_code char(6) NOT NULL UNIQUE,
  mode public.cbt_drive_mode NOT NULL DEFAULT 'on_site',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  job_role_ids uuid[] NOT NULL DEFAULT '{}',
  is_internal_benchmark boolean NOT NULL DEFAULT false,
  is_sandbox boolean NOT NULL DEFAULT false,
  show_score_to_candidate boolean NOT NULL DEFAULT false,
  status public.cbt_drive_status NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_drives TO authenticated;
GRANT ALL ON public.cbt_drives TO service_role;
ALTER TABLE public.cbt_drives ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_drives_read ON public.cbt_drives FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_drives_touch BEFORE UPDATE ON public.cbt_drives FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

CREATE TABLE public.cbt_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  mobile text,
  email text,
  city text,
  qualification text,
  experience_years numeric,
  source public.cbt_candidate_source NOT NULL DEFAULT 'Other',
  shift_availability text[] NOT NULL DEFAULT '{}',
  consent_at timestamptz,
  consent_version text,
  is_internal boolean NOT NULL DEFAULT false,
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_candidates TO authenticated;
GRANT ALL ON public.cbt_candidates TO service_role;
ALTER TABLE public.cbt_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_candidates_read ON public.cbt_candidates FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_candidates_touch BEFORE UPDATE ON public.cbt_candidates FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();
CREATE INDEX idx_cbt_candidates_mobile ON public.cbt_candidates (mobile);

-- ============ ATTEMPTS ============
CREATE SEQUENCE IF NOT EXISTS public.cbt_attempt_ref_seq START 1;
GRANT USAGE ON SEQUENCE public.cbt_attempt_ref_seq TO service_role;

CREATE TABLE public.cbt_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE,
  candidate_id uuid NOT NULL REFERENCES public.cbt_candidates(id) ON DELETE CASCADE,
  drive_id uuid NOT NULL REFERENCES public.cbt_drives(id),
  job_role_id uuid NOT NULL REFERENCES public.cbt_job_roles(id),
  blueprint_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash text,
  session_nonce uuid,
  token_expires_at timestamptz,
  status public.cbt_attempt_status NOT NULL DEFAULT 'registered',
  auto_submit_reason text,
  current_section_index int NOT NULL DEFAULT 0,
  started_at timestamptz,
  submitted_at timestamptz,
  last_heartbeat_at timestamptz,
  total_score numeric,
  decision public.cbt_decision NOT NULL DEFAULT 'pending_evaluation',
  decision_reason text,
  decision_source public.cbt_decision_source NOT NULL DEFAULT 'auto',
  warning_count int NOT NULL DEFAULT 0,
  is_internal boolean NOT NULL DEFAULT false,
  is_sandbox boolean NOT NULL DEFAULT false,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_attempts TO authenticated;
GRANT ALL ON public.cbt_attempts TO service_role;
ALTER TABLE public.cbt_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_attempts_read ON public.cbt_attempts FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_attempts_touch BEFORE UPDATE ON public.cbt_attempts FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();
CREATE INDEX idx_cbt_attempts_drive ON public.cbt_attempts (drive_id, status);
CREATE INDEX idx_cbt_attempts_candidate ON public.cbt_attempts (candidate_id);

CREATE TABLE public.cbt_attempt_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  section_code text NOT NULL,
  section_type public.cbt_section_type NOT NULL,
  status public.cbt_section_status NOT NULL DEFAULT 'pending',
  entered_at timestamptz,
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  raw_score numeric,
  max_score numeric,
  normalized_score numeric,
  gate_passed boolean,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, order_index)
);
GRANT SELECT ON public.cbt_attempt_sections TO authenticated;
GRANT ALL ON public.cbt_attempt_sections TO service_role;
ALTER TABLE public.cbt_attempt_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_attempt_sections_read ON public.cbt_attempt_sections FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE TRIGGER trg_cbt_attempt_sections_touch BEFORE UPDATE ON public.cbt_attempt_sections FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

CREATE TABLE public.cbt_attempt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_section_id uuid NOT NULL REFERENCES public.cbt_attempt_sections(id) ON DELETE CASCADE,
  question_version_id uuid NOT NULL REFERENCES public.cbt_question_versions(id),
  display_order int NOT NULL,
  option_order jsonb,
  response jsonb,
  answered_at timestamptz,
  visited boolean NOT NULL DEFAULT false,
  marked_for_review boolean NOT NULL DEFAULT false,
  marks_awarded numeric,
  is_correct boolean,
  is_red_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_section_id, display_order)
);
GRANT SELECT ON public.cbt_attempt_items TO authenticated;
GRANT ALL ON public.cbt_attempt_items TO service_role;
ALTER TABLE public.cbt_attempt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_attempt_items_read ON public.cbt_attempt_items FOR SELECT TO authenticated USING (public.cbt_can_view() OR public.cbt_can_evaluate());
CREATE TRIGGER trg_cbt_attempt_items_touch BEFORE UPDATE ON public.cbt_attempt_items FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

CREATE TABLE public.cbt_written_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_item_id uuid NOT NULL UNIQUE REFERENCES public.cbt_attempt_items(id) ON DELETE CASCADE,
  evaluator_id uuid,
  rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total numeric,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cbt_written_evaluations TO authenticated;
GRANT ALL ON public.cbt_written_evaluations TO service_role;
ALTER TABLE public.cbt_written_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_written_evaluations_read ON public.cbt_written_evaluations FOR SELECT TO authenticated USING (public.cbt_can_view() OR public.cbt_can_evaluate());
CREATE POLICY cbt_written_evaluations_write ON public.cbt_written_evaluations FOR INSERT TO authenticated WITH CHECK (public.cbt_can_evaluate() AND evaluator_id = auth.uid());
CREATE POLICY cbt_written_evaluations_update ON public.cbt_written_evaluations FOR UPDATE TO authenticated USING (public.cbt_can_evaluate() AND (evaluator_id = auth.uid() OR public.cbt_can_manage())) WITH CHECK (public.cbt_can_evaluate());
CREATE TRIGGER trg_cbt_written_evaluations_touch BEFORE UPDATE ON public.cbt_written_evaluations FOR EACH ROW EXECUTE FUNCTION public.cbt_touch_updated_at();

CREATE TABLE public.cbt_time_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_section_id uuid NOT NULL REFERENCES public.cbt_attempt_sections(id) ON DELETE CASCADE,
  seconds int NOT NULL,
  reason text,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_time_extensions TO authenticated;
GRANT ALL ON public.cbt_time_extensions TO service_role;
ALTER TABLE public.cbt_time_extensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_time_extensions_read ON public.cbt_time_extensions FOR SELECT TO authenticated USING (public.cbt_can_view());

CREATE TABLE public.cbt_resume_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_resume_codes TO authenticated;
GRANT ALL ON public.cbt_resume_codes TO service_role;
ALTER TABLE public.cbt_resume_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_resume_codes_read ON public.cbt_resume_codes FOR SELECT TO authenticated USING (public.cbt_can_manage());

CREATE TABLE public.cbt_proctor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  event_type public.cbt_proctor_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.cbt_proctor_events TO authenticated;
GRANT ALL ON public.cbt_proctor_events TO service_role;
ALTER TABLE public.cbt_proctor_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_proctor_events_read ON public.cbt_proctor_events FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE INDEX idx_cbt_proctor_events_attempt ON public.cbt_proctor_events (attempt_id, occurred_at);

CREATE TABLE public.cbt_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0
);
GRANT ALL ON public.cbt_rate_limits TO service_role;
ALTER TABLE public.cbt_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_rate_limits_none ON public.cbt_rate_limits FOR SELECT TO authenticated USING (public.cbt_can_admin());

CREATE TABLE public.cbt_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cbt_audit_log TO authenticated;
GRANT ALL ON public.cbt_audit_log TO service_role;
ALTER TABLE public.cbt_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_audit_log_read ON public.cbt_audit_log FOR SELECT TO authenticated USING (public.cbt_can_view());
CREATE INDEX idx_cbt_audit_log_entity ON public.cbt_audit_log (entity, entity_id, created_at DESC);

-- immutability of served question versions
CREATE OR REPLACE FUNCTION public.cbt_guard_served_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.first_served_at IS NOT NULL AND NEW.content::text <> OLD.content::text THEN
    RAISE EXCEPTION 'Question version % has been served and cannot be edited; create a new version instead', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cbt_question_versions_guard BEFORE UPDATE ON public.cbt_question_versions
FOR EACH ROW EXECUTE FUNCTION public.cbt_guard_served_version();