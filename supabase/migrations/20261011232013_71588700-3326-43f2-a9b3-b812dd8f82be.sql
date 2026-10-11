-- ATS foundation, migration 2 of 3: business rules (triggers). Scope: only objects named ats_*.
CREATE OR REPLACE FUNCTION public.ats_stages_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF TG_OP = 'DELETE' THEN
IF OLD.is_system THEN RAISE EXCEPTION 'ATS_SYSTEM_STAGE_LOCKED' USING HINT = 'Built-in stages can be renamed but not deleted.'; END IF;
RETURN OLD;
END IF;
IF TG_OP = 'INSERT' THEN
NEW.is_system := false;
NEW.kind := 'custom';
IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
NEW.code := coalesce(public.ats_slugify(NEW.name), 'stage') || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
END IF;
ELSE
NEW.code := OLD.code;
NEW.kind := OLD.kind;
NEW.is_system := OLD.is_system;
IF OLD.is_system THEN NEW.is_active := true; END IF;
END IF;
NEW.name := btrim(NEW.name);
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_sources_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
NEW.name := btrim(NEW.name);
IF TG_OP = 'INSERT' AND (NEW.code IS NULL OR btrim(NEW.code) = '') THEN
NEW.code := coalesce(public.ats_slugify(NEW.name), 'source');
IF EXISTS (SELECT 1 FROM public.ats_sources WHERE code = NEW.code) THEN
NEW.code := NEW.code || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
END IF;
ELSIF TG_OP = 'UPDATE' THEN
NEW.code := OLD.code; -- codes are used in tracked links; never change
END IF;
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_reject_reasons_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
NEW.label := btrim(NEW.label);
IF TG_OP = 'INSERT' AND (NEW.code IS NULL OR btrim(NEW.code) = '') THEN
NEW.code := coalesce(public.ats_slugify(NEW.label), 'reason') || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
ELSIF TG_OP = 'UPDATE' THEN
NEW.code := OLD.code;
NEW.applies_to := OLD.applies_to;
END IF;
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_settings_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
NEW.updated_at := now();
NEW.updated_by := auth.uid();
NEW.updated_by_name := public.ats_actor_name(auth.uid());
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_jobs_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_base text; v_slug text; v_n int := 1;
BEGIN
NEW.title := btrim(NEW.title);
NEW.aliases := coalesce(ARRAY(SELECT DISTINCT btrim(a) FROM unnest(NEW.aliases) AS t(a) WHERE btrim(a) <> ''), '{}'::text[]);
IF TG_OP = 'INSERT' THEN
NEW.created_by := coalesce(NEW.created_by, auth.uid());
NEW.created_by_name := coalesce(NEW.created_by_name, public.ats_actor_name(NEW.created_by));
NEW.owner_user_id := coalesce(NEW.owner_user_id, NEW.created_by);
IF NEW.owner_name IS NULL AND NEW.owner_user_id IS NOT NULL THEN
NEW.owner_name := public.ats_actor_name(NEW.owner_user_id);
END IF;
END IF;
IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
v_base := coalesce(public.ats_slugify(NEW.title), 'job');
v_slug := v_base;
WHILE EXISTS (SELECT 1 FROM public.ats_jobs WHERE slug = v_slug AND id <> NEW.id) LOOP
v_n := v_n + 1;
v_slug := v_base || '-' || v_n;
END LOOP;
NEW.slug := v_slug;
ELSE
NEW.slug := coalesce(public.ats_slugify(NEW.slug), 'job');
END IF;
IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
IF NEW.status = 'open' AND NEW.opened_at IS NULL THEN NEW.opened_at := now(); END IF;
IF NEW.status = 'closed' THEN
NEW.closed_at := coalesce(NEW.closed_at, now());
ELSIF TG_OP = 'UPDATE' THEN
NEW.closed_at := NULL;
NEW.closed_reason := NULL;
END IF;
END IF;
IF NEW.status <> 'open' THEN NEW.is_published := false; END IF;
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_jobs_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed text[];
BEGIN
IF TG_OP = 'INSERT' THEN
INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.id, 'job_created', 'Job created: ' || NEW.title,
jsonb_build_object('job_code', NEW.job_code, 'status', NEW.status),
auth.uid(), public.ats_actor_name(auth.uid()));
RETURN NULL;
END IF;
IF NEW.status IS DISTINCT FROM OLD.status THEN
INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.id, 'job_status_changed', 'Status changed from ' || OLD.status || ' to ' || NEW.status,
jsonb_build_object('from', OLD.status, 'to', NEW.status, 'reason', NEW.closed_reason),
auth.uid(), public.ats_actor_name(auth.uid()));
END IF;
SELECT array_agg(n.k ORDER BY n.k) INTO v_changed
FROM jsonb_each(to_jsonb(NEW)) AS n(k, v)
WHERE n.k NOT IN ('updated_at', 'status', 'opened_at', 'closed_at', 'closed_reason', 'is_published')
AND n.v IS DISTINCT FROM (to_jsonb(OLD) -> n.k);
IF v_changed IS NOT NULL THEN
INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.id, 'job_updated', 'Job details updated', jsonb_build_object('fields', to_jsonb(v_changed)),
auth.uid(), public.ats_actor_name(auth.uid()));
END IF;
IF NEW.is_published IS DISTINCT FROM OLD.is_published THEN
INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.id, CASE WHEN NEW.is_published THEN 'job_published' ELSE 'job_unpublished' END,
CASE WHEN NEW.is_published THEN 'Published on the careers page' ELSE 'Removed from the careers page' END,
'{}'::jsonb, auth.uid(), public.ats_actor_name(auth.uid()));
END IF;
RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.ats_candidates_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
NEW.full_name := regexp_replace(btrim(NEW.full_name), '\s+', ' ', 'g');
NEW.email := nullif(btrim(NEW.email), '');
NEW.phone := nullif(btrim(NEW.phone), '');
NEW.updated_at := now();
IF TG_OP = 'INSERT' THEN
NEW.created_by := coalesce(NEW.created_by, auth.uid());
NEW.created_by_name := coalesce(NEW.created_by_name, public.ats_actor_name(NEW.created_by));
END IF;
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_candidates_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed text[];
BEGIN
IF TG_OP = 'INSERT' THEN
INSERT INTO public.ats_events (candidate_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.id, 'candidate_created', 'Candidate record created',
jsonb_build_object('ref_no', NEW.ref_no, 'source_id', NEW.source_id),
auth.uid(), public.ats_actor_name(auth.uid()));
RETURN NULL;
END IF;
SELECT array_agg(n.k ORDER BY n.k) INTO v_changed
FROM jsonb_each(to_jsonb(NEW)) AS n(k, v)
WHERE n.k NOT IN ('updated_at', 'last_activity_at', 'search_text', 'email_norm', 'phone_norm')
AND n.v IS DISTINCT FROM (to_jsonb(OLD) -> n.k);
IF v_changed IS NOT NULL THEN
INSERT INTO public.ats_events (candidate_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.id, 'candidate_updated', 'Profile updated', jsonb_build_object('fields', to_jsonb(v_changed)),
auth.uid(), public.ats_actor_name(auth.uid()));
END IF;
RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.ats_applications_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_new_kind text; v_old_kind text; v_applies text; v_offer uuid; v_hired uuid;
BEGIN
IF TG_OP = 'INSERT' THEN
IF NEW.stage_id IS NULL THEN
SELECT id INTO NEW.stage_id FROM public.ats_stages WHERE code = 'new';
END IF;
NEW.created_by := coalesce(NEW.created_by, auth.uid());
NEW.created_by_name := coalesce(NEW.created_by_name, public.ats_actor_name(NEW.created_by));
ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
NEW.stage_entered_at := now();
END IF;
SELECT kind INTO v_new_kind FROM public.ats_stages WHERE id = NEW.stage_id;
IF TG_OP = 'UPDATE' THEN
SELECT kind INTO v_old_kind FROM public.ats_stages WHERE id = OLD.stage_id;
END IF;
-- Status explicitly set to hired while on a non-hired stage: move to the Hired stage so stage and status agree.
IF NEW.status = 'hired' AND v_new_kind IS DISTINCT FROM 'hired'
AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'hired') THEN
SELECT id INTO v_hired FROM public.ats_stages WHERE code = 'hired';
IF v_hired IS NOT NULL THEN
NEW.stage_id := v_hired;
NEW.stage_entered_at := now();
v_new_kind := 'hired';
END IF;
END IF;
IF v_new_kind = 'hired' AND (TG_OP = 'INSERT' OR v_old_kind IS DISTINCT FROM 'hired') THEN
NEW.status := 'hired';
END IF;
IF TG_OP = 'UPDATE' AND OLD.status = 'hired' THEN
IF NEW.status <> 'hired' AND v_new_kind = 'hired' THEN
SELECT id INTO v_offer FROM public.ats_stages WHERE code = 'offer';
NEW.stage_id := coalesce(v_offer, NEW.stage_id);
NEW.stage_entered_at := now();
ELSIF NEW.status = 'hired' AND v_new_kind IS DISTINCT FROM 'hired' THEN
NEW.status := 'active';
END IF;
END IF;
IF NEW.status = 'hired' THEN
NEW.hired_at := coalesce(NEW.hired_at, now());
ELSE
NEW.hired_at := NULL;
END IF;
IF NEW.status IN ('rejected', 'withdrawn') THEN
IF NEW.reject_reason_id IS NULL THEN
RAISE EXCEPTION 'ATS_REASON_REQUIRED' USING HINT = 'Choose a reason before rejecting or withdrawing.';
END IF;
SELECT applies_to INTO v_applies FROM public.ats_reject_reasons WHERE id = NEW.reject_reason_id;
IF v_applies IS DISTINCT FROM NEW.status THEN
RAISE EXCEPTION 'ATS_REASON_MISMATCH' USING HINT = 'The reason does not match the chosen status.';
END IF;
ELSE
NEW.reject_reason_id := NULL;
END IF;
IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
NEW.status_changed_at := now();
NEW.status_changed_by := auth.uid();
NEW.status_changed_by_name := public.ats_actor_name(auth.uid());
END IF;
NEW.updated_at := now();
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_applications_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
v_actor uuid := auth.uid();
v_name text := public.ats_actor_name(auth.uid());
v_note text := nullif(current_setting('ats.transition_note', true), '');
v_job text; v_from text; v_to text; v_reason text;
BEGIN
IF TG_OP = 'INSERT' THEN
SELECT title INTO v_job FROM public.ats_jobs WHERE id = NEW.job_id;
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'application_created',
'Applied for ' || coalesce(v_job, 'a general application'),
jsonb_build_object('applied_via', NEW.applied_via, 'source_id', NEW.source_id, 'position_text', NEW.position_text),
v_actor, v_name);
ELSE
IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
SELECT name INTO v_from FROM public.ats_stages WHERE id = OLD.stage_id;
SELECT name INTO v_to FROM public.ats_stages WHERE id = NEW.stage_id;
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'stage_changed',
'Moved from ' || coalesce(v_from, '?') || ' to ' || coalesce(v_to, '?'),
jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id, 'note', v_note),
v_actor, v_name);
END IF;
IF NEW.status IS DISTINCT FROM OLD.status THEN
SELECT label INTO v_reason FROM public.ats_reject_reasons WHERE id = NEW.reject_reason_id;
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'status_changed',
CASE NEW.status
WHEN 'active' THEN 'Reopened'
WHEN 'on_hold' THEN 'Put on hold'
WHEN 'rejected' THEN 'Rejected'
WHEN 'withdrawn' THEN 'Withdrawn'
WHEN 'hired' THEN 'Hired'
ELSE NEW.status END || coalesce(' - ' || v_reason, ''),
jsonb_build_object('from', OLD.status, 'to', NEW.status, 'reason_id', NEW.reject_reason_id,
'note', coalesce(v_note, NEW.status_note)),
v_actor, v_name);
END IF;
IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.id, NEW.job_id, 'application_moved_job', 'Moved to another job',
jsonb_build_object('from_job_id', OLD.job_id, 'to_job_id', NEW.job_id), v_actor, v_name);
END IF;
END IF;
UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = NEW.candidate_id;
RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.ats_files_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF TG_OP = 'INSERT' THEN
NEW.uploaded_by := coalesce(NEW.uploaded_by, auth.uid());
NEW.uploaded_by_name := coalesce(NEW.uploaded_by_name, public.ats_actor_name(NEW.uploaded_by));
IF NEW.kind = 'resume' AND NOT EXISTS (
SELECT 1 FROM public.ats_files WHERE candidate_id = NEW.candidate_id AND kind = 'resume' AND is_primary) THEN
NEW.is_primary := true;
END IF;
ELSE
NEW.candidate_id := OLD.candidate_id;
NEW.storage_path := OLD.storage_path;
NEW.uploaded_by := OLD.uploaded_by;
NEW.uploaded_by_name := OLD.uploaded_by_name;
END IF;
IF NEW.kind <> 'resume' THEN NEW.is_primary := false; END IF;
IF NEW.is_primary AND (TG_OP = 'INSERT' OR NOT OLD.is_primary) THEN
UPDATE public.ats_files SET is_primary = false
WHERE candidate_id = NEW.candidate_id AND kind = 'resume' AND is_primary AND id <> NEW.id;
END IF;
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_files_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
IF TG_OP = 'INSERT' THEN
INSERT INTO public.ats_events (candidate_id, application_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.application_id, 'file_added', 'Added ' || NEW.kind || ': ' || NEW.file_name,
jsonb_build_object('file_id', NEW.id, 'kind', NEW.kind, 'source', NEW.source),
auth.uid(), public.ats_actor_name(auth.uid()));
UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = NEW.candidate_id;
ELSIF TG_OP = 'DELETE' THEN
IF EXISTS (SELECT 1 FROM public.ats_candidates WHERE id = OLD.candidate_id) THEN
INSERT INTO public.ats_events (candidate_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (OLD.candidate_id, 'file_removed', 'Removed ' || OLD.kind || ': ' || OLD.file_name,
jsonb_build_object('kind', OLD.kind), auth.uid(), public.ats_actor_name(auth.uid()));
-- Removing the main resume promotes the newest remaining resume, so the profile still opens one.
IF OLD.kind = 'resume' AND OLD.is_primary THEN
UPDATE public.ats_files SET is_primary = true
WHERE id = (SELECT f.id FROM public.ats_files f
WHERE f.candidate_id = OLD.candidate_id AND f.kind = 'resume'
ORDER BY f.created_at DESC LIMIT 1);
END IF;
END IF;
END IF;
RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.ats_notes_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF TG_OP = 'INSERT' THEN
NEW.author_user_id := coalesce(auth.uid(), NEW.author_user_id);
NEW.author_name := public.ats_actor_name(NEW.author_user_id);
ELSE
NEW.author_user_id := OLD.author_user_id;
NEW.author_name := OLD.author_name;
NEW.candidate_id := OLD.candidate_id;
NEW.created_at := OLD.created_at;
END IF;
NEW.body := btrim(NEW.body);
NEW.updated_at := now();
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_notes_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
INSERT INTO public.ats_events (candidate_id, application_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.application_id, 'note_added', left(NEW.body, 140),
jsonb_build_object('note_id', NEW.id), NEW.author_user_id, NEW.author_name);
UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = NEW.candidate_id;
RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.ats_ratings_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF TG_OP = 'INSERT' THEN
NEW.rater_user_id := coalesce(auth.uid(), NEW.rater_user_id);
NEW.rater_name := public.ats_actor_name(NEW.rater_user_id);
ELSE
NEW.rater_user_id := OLD.rater_user_id;
NEW.rater_name := OLD.rater_name;
NEW.application_id := OLD.application_id;
NEW.created_at := OLD.created_at;
END IF;
NEW.updated_at := now();
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ats_ratings_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app uuid; v_cand uuid; v_job uuid;
BEGIN
v_app := CASE WHEN TG_OP = 'DELETE' THEN OLD.application_id ELSE NEW.application_id END;
UPDATE public.ats_applications a
SET rating_avg = s.avg_score, rating_count = s.cnt
FROM (SELECT round(avg(score)::numeric, 2) AS avg_score, count(*)::int AS cnt
FROM public.ats_ratings WHERE application_id = v_app) s
WHERE a.id = v_app;
IF TG_OP IN ('INSERT', 'UPDATE') THEN
SELECT candidate_id, job_id INTO v_cand, v_job FROM public.ats_applications WHERE id = v_app;
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (v_cand, v_app, v_job, CASE WHEN TG_OP = 'INSERT' THEN 'rating_added' ELSE 'rating_updated' END,
'Rated ' || NEW.score || ' of 5', jsonb_build_object('score', NEW.score, 'comment', NEW.comment),
NEW.rater_user_id, NEW.rater_name);
END IF;
RETURN NULL;
END $$;
CREATE TRIGGER ats_stages_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.ats_stages
FOR EACH ROW EXECUTE FUNCTION public.ats_stages_guard();
CREATE TRIGGER ats_stages_touch_trg BEFORE UPDATE ON public.ats_stages
FOR EACH ROW EXECUTE FUNCTION public.ats_touch_updated_at();
CREATE TRIGGER ats_sources_before_trg BEFORE INSERT OR UPDATE ON public.ats_sources
FOR EACH ROW EXECUTE FUNCTION public.ats_sources_before_write();
CREATE TRIGGER ats_sources_touch_trg BEFORE UPDATE ON public.ats_sources
FOR EACH ROW EXECUTE FUNCTION public.ats_touch_updated_at();
CREATE TRIGGER ats_reject_reasons_before_trg BEFORE INSERT OR UPDATE ON public.ats_reject_reasons
FOR EACH ROW EXECUTE FUNCTION public.ats_reject_reasons_before_write();
CREATE TRIGGER ats_reject_reasons_touch_trg BEFORE UPDATE ON public.ats_reject_reasons
FOR EACH ROW EXECUTE FUNCTION public.ats_touch_updated_at();
CREATE TRIGGER ats_settings_before_trg BEFORE UPDATE ON public.ats_settings
FOR EACH ROW EXECUTE FUNCTION public.ats_settings_before_update();
CREATE TRIGGER ats_jobs_before_trg BEFORE INSERT OR UPDATE ON public.ats_jobs
FOR EACH ROW EXECUTE FUNCTION public.ats_jobs_before_write();
CREATE TRIGGER ats_jobs_touch_trg BEFORE UPDATE ON public.ats_jobs
FOR EACH ROW EXECUTE FUNCTION public.ats_touch_updated_at();
CREATE TRIGGER ats_jobs_after_trg AFTER INSERT OR UPDATE ON public.ats_jobs
FOR EACH ROW EXECUTE FUNCTION public.ats_jobs_after_write();
CREATE TRIGGER ats_candidates_before_trg BEFORE INSERT OR UPDATE ON public.ats_candidates
FOR EACH ROW EXECUTE FUNCTION public.ats_candidates_before_write();
CREATE TRIGGER ats_candidates_after_trg AFTER INSERT OR UPDATE ON public.ats_candidates
FOR EACH ROW EXECUTE FUNCTION public.ats_candidates_after_write();
CREATE TRIGGER ats_applications_before_trg BEFORE INSERT OR UPDATE ON public.ats_applications
FOR EACH ROW EXECUTE FUNCTION public.ats_applications_before_write();
CREATE TRIGGER ats_applications_after_trg AFTER INSERT OR UPDATE ON public.ats_applications
FOR EACH ROW EXECUTE FUNCTION public.ats_applications_after_write();
CREATE TRIGGER ats_files_before_trg BEFORE INSERT OR UPDATE ON public.ats_files
FOR EACH ROW EXECUTE FUNCTION public.ats_files_before_write();
CREATE TRIGGER ats_files_after_trg AFTER INSERT OR DELETE ON public.ats_files
FOR EACH ROW EXECUTE FUNCTION public.ats_files_after_write();
CREATE TRIGGER ats_notes_before_trg BEFORE INSERT OR UPDATE ON public.ats_notes
FOR EACH ROW EXECUTE FUNCTION public.ats_notes_before_write();
CREATE TRIGGER ats_notes_after_trg AFTER INSERT ON public.ats_notes
FOR EACH ROW EXECUTE FUNCTION public.ats_notes_after_insert();
CREATE TRIGGER ats_ratings_before_trg BEFORE INSERT OR UPDATE ON public.ats_ratings
FOR EACH ROW EXECUTE FUNCTION public.ats_ratings_before_write();
CREATE TRIGGER ats_ratings_after_trg AFTER INSERT OR UPDATE OR DELETE ON public.ats_ratings
FOR EACH ROW EXECUTE FUNCTION public.ats_ratings_after_write();
REVOKE ALL ON FUNCTION
public.ats_stages_guard(), public.ats_sources_before_write(), public.ats_reject_reasons_before_write(),
public.ats_settings_before_update(), public.ats_jobs_before_write(), public.ats_jobs_after_write(),
public.ats_candidates_before_write(), public.ats_candidates_after_write(),
public.ats_applications_before_write(), public.ats_applications_after_write(),
public.ats_files_before_write(), public.ats_files_after_write(),
public.ats_notes_before_write(), public.ats_notes_after_insert(),
public.ats_ratings_before_write(), public.ats_ratings_after_write()
FROM PUBLIC, anon, authenticated;