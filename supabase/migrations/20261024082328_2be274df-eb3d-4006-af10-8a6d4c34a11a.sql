CREATE OR REPLACE FUNCTION public.hr_prejoining_submit(p_invite_id uuid,p_payload jsonb,p_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.hr_onboarding_invites%ROWTYPE; o public.hr_employee_onboarding%ROWTYPE; r jsonb; k text;
BEGIN
 SELECT * INTO i FROM public.hr_onboarding_invites WHERE id=p_invite_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
 SELECT * INTO o FROM public.hr_employee_onboarding WHERE id=i.onboarding_id FOR UPDATE;
 SELECT * INTO i FROM public.hr_onboarding_invites WHERE id=p_invite_id FOR UPDATE;
 IF i.status='submitted' THEN RAISE EXCEPTION 'This form has already been submitted'; END IF;
 IF i.expires_at<now() OR o.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'The onboarding link is closed'; END IF;
 IF NOT COALESCE((o.prejoining->>'enabled')::boolean,false) OR (o.prejoining->>'version')::integer IS DISTINCT FROM p_version OR (p_payload->>'package_version')::integer IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Reload the current offer'; END IF;
 IF p_payload->>'joining_date' IS DISTINCT FROM o.prejoining->>'joining_date' OR p_payload->>'joining_confirmed' IS DISTINCT FROM 'true' OR p_payload->>'e2_consent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirm joining and E2 consent'; END IF;
 FOREACH k IN ARRAY ARRAY['signed_offer','pan_card','aadhaar','photo','cancelled_cheque','signed_e2','pcc_application'] LOOP
  IF jsonb_typeof(p_payload->'documents'->k) IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'documents'->k)<1 THEN RAISE EXCEPTION 'Required document missing: %',k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['criminal','bank','platforms','relationships'] LOOP IF NULLIF(btrim(p_payload->'e2_disclosures'->>k),'') IS NULL THEN RAISE EXCEPTION 'Disclosure required: %',k; END IF; END LOOP;
 r=COALESCE(o.prejoining->'reviews','{}'::jsonb);
 FOREACH k IN ARRAY ARRAY['details','signed_offer','pan_card','aadhaar','photo','cancelled_cheque','education','experience','signed_e2','pcc_application'] LOOP
  IF r->k->>'status'='approved' AND o.prejoining->>'state'='corrections' AND k<>'details' AND p_payload->'documents'->k IS DISTINCT FROM i.payload->'documents'->k THEN RAISE EXCEPTION 'Approved document cannot change: %',k; END IF;
  IF r->k->>'status' IS DISTINCT FROM 'approved' THEN r=jsonb_set(r,ARRAY[k],'{"status":"pending"}'::jsonb,true); END IF;
 END LOOP;
 UPDATE public.hr_onboarding_invites SET payload=p_payload,status='submitted',submitted_at=now() WHERE id=i.id;
 UPDATE public.hr_employee_onboarding SET prejoining=o.prejoining||jsonb_build_object('state','submitted','reviews',r,'submission',p_payload,'submitted_at',now(),'arrival_confirmed_at',NULL),updated_at=now() WHERE id=o.id;
END $$;
REVOKE ALL ON FUNCTION public.hr_prejoining_submit(uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_prejoining_submit(uuid,jsonb,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.hr_prejoining_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; s jsonb;
BEGIN
 IF NEW.prejoining IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.prejoining ELSE '{}'::jsonb END) AND auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR may manage pre-joining'; END IF;
 IF COALESCE((NEW.prejoining->>'enabled')::boolean,false) THEN
  IF TG_OP='UPDATE' AND (NEW.date_of_joining IS DISTINCT FROM OLD.date_of_joining OR NEW.job_role IS DISTINCT FROM OLD.job_role) AND NEW.prejoining IS NOT DISTINCT FROM OLD.prejoining THEN
    NEW.prejoining=NEW.prejoining||jsonb_build_object('state','revision_required','reviews','{}'::jsonb,'arrival_confirmed_at',NULL);
  END IF;
  IF TG_OP='UPDATE' AND NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
   IF NEW.prejoining->>'state' IS DISTINCT FROM 'ready' OR NEW.prejoining->>'arrival_confirmed_at' IS NULL THEN RAISE EXCEPTION 'Pre-joining requires HR review and confirmed arrival'; END IF;
   IF NEW.date_of_joining IS NULL OR NEW.date_of_joining > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Actual joining cannot be confirmed before the joining date'; END IF;
   s=NEW.prejoining->'submission';
   IF s->>'joining_date' IS DISTINCT FROM NEW.date_of_joining::text OR s->>'package_version' IS DISTINCT FROM NEW.prejoining->>'version' THEN RAISE EXCEPTION 'Current offer acceptance required'; END IF;
   FOREACH k IN ARRAY ARRAY['details','signed_offer','pan_card','aadhaar','photo','cancelled_cheque','signed_e2','pcc_application'] LOOP IF NEW.prejoining->'reviews'->k->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'HR approval required: %',k; END IF; END LOOP;
  END IF;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_prejoining_guard() FROM PUBLIC,anon,authenticated;