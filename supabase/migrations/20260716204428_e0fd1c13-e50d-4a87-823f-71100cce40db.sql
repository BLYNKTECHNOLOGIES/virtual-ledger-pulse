
CREATE OR REPLACE FUNCTION public.hr_match_employee_by_normalized_name(p_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id
    FROM public.hr_employees
    WHERE lower(regexp_replace(
             coalesce(first_name,'') || coalesce(last_name,''),
             '[^a-zA-Z0-9]+', '', 'g'
           )) = p_name
    LIMIT 2
  ) t;

  IF v_ids IS NULL OR array_length(v_ids, 1) <> 1 THEN
    RETURN NULL;
  END IF;
  RETURN v_ids[1];
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_match_employee_by_normalized_name(text)
  TO authenticated, service_role;
