DO $do$
DECLARE
  v_punch jsonb;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_attendance_stale_sessions ss
    JOIN public.hr_attendance_sessions s ON s.id = ss.session_id
    JOIN public.hr_employees e ON e.id = ss.employee_id
    WHERE ss.id = '230af0c4-2a0c-4bb2-8cb8-3a39f0b7225e'::uuid
      AND ss.status = 'open' AND e.badge_id = '34'
      AND ss.employee_id = '18685df0-ea6a-4c00-bf5f-d08e44526043'::uuid
      AND s.id = '9845ca48-5f71-49cf-a8fc-416a6e295687'::uuid
      AND s.in_punch_id = 'f669b3ed-81aa-4ae0-8371-9d23e5917335'::uuid
      AND s.in_time = '2026-10-17T19:32:16Z'::timestamptz
      AND s.out_time IS NULL
  ) THEN
    RAISE EXCEPTION 'The confirmed stray session changed; nothing was voided.';
  END IF;

  SELECT to_jsonb(p) INTO v_punch FROM public.hr_attendance_punches p
    WHERE p.id = 'f669b3ed-81aa-4ae0-8371-9d23e5917335'::uuid FOR UPDATE;
  IF v_punch IS NULL THEN RAISE EXCEPTION 'Original punch missing; nothing was changed.'; END IF;

  v_result := public.hr_resolve_stale_session(
    '9845ca48-5f71-49cf-a8fc-416a6e295687'::uuid,
    'void', NULL,
    'Owner confirmed in Lovable chat on 21 Oct 2026 IST that the 18 Oct 01:02:16 IST in-punch was stray. Executed by Lovable via database migration; no user impersonation. Original punch preserved in hr_attendance_intervention_log.'
  );

  IF v_result->>'resolution' IS DISTINCT FROM 'void'
     OR EXISTS (SELECT 1 FROM public.hr_attendance_punches WHERE id = 'f669b3ed-81aa-4ae0-8371-9d23e5917335'::uuid)
     OR EXISTS (SELECT 1 FROM public.hr_attendance_stale_sessions WHERE id = '230af0c4-2a0c-4bb2-8cb8-3a39f0b7225e'::uuid AND status = 'open') THEN
    RAISE EXCEPTION 'Void did not take effect; rolling back.';
  END IF;

  INSERT INTO public.hr_attendance_intervention_log
    (session_id, employee_id, action, reason_code, notes, actor_id, actor_email, payload)
  VALUES
    ('9845ca48-5f71-49cf-a8fc-416a6e295687'::uuid,
     '18685df0-ea6a-4c00-bf5f-d08e44526043'::uuid,
     'void', 'stale_session_resolution',
     'Owner-confirmed stray punch, 18 Oct 2026 01:02:16 IST. Executed by Lovable via migration on owner instruction; actor UUID intentionally unset, not impersonated.',
     NULL, NULL, jsonb_build_object('original_punch', v_punch, 'resolver_result', v_result, 'authorization', 'Owner selected Stray punch in Lovable chat, 21 Oct 2026 IST'));
END;
$do$;