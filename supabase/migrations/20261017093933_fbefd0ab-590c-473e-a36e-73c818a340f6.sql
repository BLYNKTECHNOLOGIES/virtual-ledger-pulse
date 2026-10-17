REVOKE ALL ON FUNCTION public.ats_jobs_requisition_check() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_wf_requirement_line_jobs_check() FROM PUBLIC, anon, authenticated;

DO $c$
DECLARE v_reason constant text := 'Data correction approved by the owner on 17 Oct 2026';
  r4 public.hr_hiring_requirements; r12 public.hr_hiring_requirements; r10 public.hr_hiring_requirements;
  j2 public.ats_jobs; j3 public.ats_jobs; v_eve uuid; p record;
BEGIN
  PERFORM set_config('hr.wf_change_reason', v_reason, true);
  SELECT * INTO r4 FROM public.hr_hiring_requirements WHERE requirement_no = 'HR-2026-0004';
  SELECT * INTO r12 FROM public.hr_hiring_requirements WHERE requirement_no = 'HR-2026-0012';
  SELECT * INTO r10 FROM public.hr_hiring_requirements WHERE requirement_no = 'HR-2026-0010';
  SELECT * INTO j2 FROM public.ats_jobs WHERE job_code = 'JOB-0002';
  SELECT * INTO j3 FROM public.ats_jobs WHERE job_code = 'JOB-0003';
  IF r4.id IS NULL OR r12.id IS NULL OR r10.id IS NULL OR j2.id IS NULL OR j3.id IS NULL THEN RAISE EXCEPTION 'WF6 correction: record missing'; END IF;
  SELECT id INTO v_eve FROM public.hr_shifts WHERE lower(name) = 'evening shift' AND id = ANY(j2.shift_ids);
  IF v_eve IS NULL OR r10.shift_id IS NULL THEN RAISE EXCEPTION 'WF6 correction: shift not found'; END IF;

  -- 3.1 (audited by hr_wf_audit_requirement with the reason above)
  IF r4.number_required <> 6 THEN RAISE EXCEPTION 'WF6 correction: HR-2026-0004 is % not 6', r4.number_required; END IF;
  UPDATE public.hr_hiring_requirements SET number_required = 4 WHERE id = r4.id;

  -- 3.2
  UPDATE public.ats_jobs SET shift_ids = array_remove(shift_ids, v_eve) WHERE id = j2.id;
  INSERT INTO public.ats_job_requirements (job_id, requirement_id) VALUES (j2.id, r12.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
  VALUES (j2.id, 'job_updated', 'Evening Shift removed; HR-2026-0012 (Night) linked — ' || v_reason,
          jsonb_build_object('reason', v_reason, 'removed_shift', v_eve, 'linked_requirement', r12.id, 'old_shift_ids', to_jsonb(j2.shift_ids)), 'System');

  -- 3.3
  UPDATE public.ats_jobs SET shift_ids = ARRAY[r10.shift_id], requisition_id = r10.id WHERE id = j3.id;
  INSERT INTO public.ats_events (job_id, event_type, summary, data, actor_name)
  VALUES (j3.id, 'job_updated', 'Linked to HR-2026-0010 (KYC Associate · Evening); shifts set to Evening — ' || v_reason,
          jsonb_build_object('reason', v_reason, 'requirement_id', r10.id, 'old_shift_ids', to_jsonb(j3.shift_ids), 'old_requisition_id', j3.requisition_id), 'System');

  -- 3.4
  FOR p IN SELECT id, title, in_workforce_planning FROM public.positions
            WHERE title IN ('Chief Executive Officer','Deputy Managing Director') AND in_workforce_planning LOOP
    UPDATE public.positions SET in_workforce_planning = false WHERE id = p.id;
    INSERT INTO public.hr_workforce_plan_audit (entity, entity_id, field_changed, old_value, new_value, reason, changed_by)
    VALUES ('position', p.id, 'In workforce planning (' || p.title || ')', 'true', 'false', v_reason, NULL);
  END LOOP;
END $c$;