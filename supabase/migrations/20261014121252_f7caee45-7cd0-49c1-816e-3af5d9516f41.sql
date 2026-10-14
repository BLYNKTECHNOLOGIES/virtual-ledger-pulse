
DROP FUNCTION IF EXISTS public.um_link_hr_employee(uuid, uuid);
CREATE OR REPLACE FUNCTION public.um_link_hr_employee(p_user_id uuid, p_badge text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_emp uuid; v_other uuid; v_changed boolean := false;
BEGIN
  IF NOT public.um_can_act(v_caller, p_user_id, 'link') THEN
    RAISE EXCEPTION 'You cannot change the HRMS link for this person';
  END IF;
  IF nullif(trim(p_badge), '') IS NOT NULL THEN
    SELECT id, user_id INTO v_emp, v_other FROM public.hr_employees WHERE badge_id = trim(p_badge) LIMIT 1;
    IF v_emp IS NOT NULL AND v_other IS NOT NULL AND v_other <> p_user_id THEN
      RAISE EXCEPTION 'This HRMS employee is already linked to another login';
    END IF;
  END IF;
  UPDATE public.hr_employees SET user_id = NULL WHERE user_id = p_user_id AND id IS DISTINCT FROM v_emp;
  IF FOUND THEN v_changed := true; END IF;
  IF v_emp IS NOT NULL THEN
    UPDATE public.hr_employees SET user_id = p_user_id WHERE id = v_emp AND user_id IS DISTINCT FROM p_user_id;
    IF FOUND THEN v_changed := true; END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'changed', v_changed, 'linked', v_emp IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.um_link_hr_employee(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.um_link_hr_employee(uuid, text) TO authenticated, service_role;
