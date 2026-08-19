
ALTER TABLE public.hr_doc_reference_sequences ALTER COLUMN pattern SET DEFAULT 'BLY-{SEQ:6}';
UPDATE public.hr_doc_reference_sequences SET pattern = 'BLY-{SEQ:6}' WHERE pattern = 'BLYNK/{TYPE}/{FY}/{SEQ:4}';

CREATE OR REPLACE FUNCTION public.hr_doc_allocate_reference(_scope_key text, _pattern text DEFAULT NULL, _type_code text DEFAULT 'DOC')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next integer; v_pattern text; v_fy text; v_width integer; v_seq text; v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  INSERT INTO public.hr_doc_reference_sequences(scope_key, pattern)
    VALUES (_scope_key, COALESCE(_pattern, 'BLY-{SEQ:6}'))
    ON CONFLICT (scope_key) DO NOTHING;
  UPDATE public.hr_doc_reference_sequences
     SET last_value = last_value + 1, updated_at = now()
   WHERE scope_key = _scope_key
   RETURNING last_value, pattern INTO v_next, v_pattern;
  v_pattern := COALESCE(_pattern, v_pattern);
  IF EXTRACT(MONTH FROM v_today) >= 4 THEN
    v_fy := to_char(v_today,'YYYY') || '-' || to_char((v_today + interval '1 year'),'YY');
  ELSE
    v_fy := to_char((v_today - interval '1 year'),'YYYY') || '-' || to_char(v_today,'YY');
  END IF;
  v_width := COALESCE(NULLIF((regexp_match(v_pattern, '\{SEQ:(\d+)\}'))[1],'')::int, 6);
  v_seq := lpad(v_next::text, v_width, '0');
  v_pattern := regexp_replace(v_pattern, '\{SEQ(:\d+)?\}', v_seq, 'g');
  v_pattern := replace(v_pattern, '{TYPE}', upper(_type_code));
  v_pattern := replace(v_pattern, '{FY}', v_fy);
  v_pattern := replace(v_pattern, '{YYYY}', to_char(v_today,'YYYY'));
  v_pattern := replace(v_pattern, '{MM}', to_char(v_today,'MM'));
  RETURN v_pattern;
END; $$;

CREATE OR REPLACE FUNCTION public.hr_doc_can_view_sensitive(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.hr_is_hr_staff(_user_id);
$$;
