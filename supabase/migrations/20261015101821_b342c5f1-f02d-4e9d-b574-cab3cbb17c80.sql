DO $mig$
DECLARE
  v_src text; v_new text;
  v_loop text := E'    WHILE v_exp_end <= v_session.in_time LOOP\n      v_exp_end := v_exp_end + INTERVAL ''1 day'';\n    END LOOP;';
  v_anchor text := E'  -- Recompute rebuilds sessions with new ids; close any orphaned stale rows for';
BEGIN
  v_src := pg_get_functiondef('public.hr_resolve_stale_session(uuid,text,timestamptz,text)'::regprocedure);
  IF position(v_loop IN v_src) = 0 OR position(v_anchor IN v_src) = 0 THEN
    RAISE EXCEPTION 'hr_resolve_stale_session body changed; patch not applied';
  END IF;
  v_new := replace(v_src, v_loop,
    E'    -- In-punch after this day''s shift end: rolling the out into the next day lands it in the\n' ||
    E'    -- next day''s window, so it never closes this session and the entry keeps returning. Refuse.\n' ||
    E'    IF v_exp_end <= v_session.in_time THEN\n' ||
    E'      RAISE EXCEPTION ''This in-punch (%) is after the scheduled shift end (%), so "Present - shift-standard out" cannot close it. Use Void if it was a stray punch, or Set out-time.'',\n' ||
    E'        to_char(v_session.in_time AT TIME ZONE ''Asia/Kolkata'', ''DD Mon HH24:MI''), to_char(v_exp_end AT TIME ZONE ''Asia/Kolkata'', ''DD Mon HH24:MI'') USING ERRCODE = ''P0001'';\n' ||
    E'    END IF;');
  v_new := replace(v_new, v_anchor,
    E'  -- Never report a resolution that did not take effect: if the session is still open after the\n' ||
    E'  -- recompute, roll everything back (added punch included) and tell HR.\n' ||
    E'  IF p_resolution <> ''void'' AND EXISTS (SELECT 1 FROM public.hr_attendance_sessions s\n' ||
    E'       WHERE s.employee_id = v_emp AND s.in_punch_id = v_session.in_punch_id AND s.out_time IS NULL) THEN\n' ||
    E'    RAISE EXCEPTION ''The punch-out was not applied to this session, so it would stay open. Nothing was changed - use Set out-time with a time on the same day, or Void.'' USING ERRCODE = ''P0001'';\n' ||
    E'  END IF;\n\n' || v_anchor);
  EXECUTE v_new;
END $mig$;