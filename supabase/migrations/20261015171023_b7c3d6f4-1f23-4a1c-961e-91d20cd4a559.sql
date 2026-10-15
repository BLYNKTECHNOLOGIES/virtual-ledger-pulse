CREATE OR REPLACE FUNCTION public.binance_accounts_for_user(p_user_id uuid DEFAULT NULL)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_ids uuid[];
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  -- Signed-in users may only ask about themselves; the service role may ask about anyone.
  IF auth.uid() IS NOT NULL AND v_uid <> auth.uid()
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- 1) Explicit mappings govern visibility for everyone (only active accounts).
  SELECT array_agg(a.id ORDER BY a.display_order, a.id) INTO v_ids
  FROM public.terminal_user_exchange_mappings m
  JOIN public.terminal_exchange_accounts a ON a.id = m.exchange_account_id AND a.is_active
  WHERE m.user_id = v_uid;
  IF EXISTS (SELECT 1 FROM public.terminal_user_exchange_mappings WHERE user_id = v_uid) THEN
    RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
  END IF;

  -- 2) No mapping: ERP Admin / Super Admin see every active account.
  --    Roles are read as the screen reads them: user_roles, else users.role_id.
  WITH r AS (
    SELECT ro.name FROM public.user_roles ur JOIN public.roles ro ON ro.id = ur.role_id WHERE ur.user_id = v_uid
  ), r2 AS (
    SELECT name FROM r
    UNION ALL
    SELECT ro.name FROM public.users u JOIN public.roles ro ON ro.id = u.role_id
    WHERE u.id = v_uid AND NOT EXISTS (SELECT 1 FROM r)
  )
  SELECT EXISTS (
    SELECT 1 FROM r2
    WHERE regexp_replace(lower(trim(name)), '[\s_-]+', '', 'g') IN ('admin', 'superadmin')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    SELECT array_agg(id ORDER BY display_order, id) INTO v_ids
    FROM public.terminal_exchange_accounts WHERE is_active;
    RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
  END IF;

  -- 3) Everyone else: the default account (else the first active one).
  SELECT ARRAY[id] INTO v_ids FROM public.terminal_exchange_accounts
  WHERE is_active ORDER BY is_default DESC, display_order, id LIMIT 1;
  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;

REVOKE ALL ON FUNCTION public.binance_accounts_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.binance_accounts_for_user(uuid) TO authenticated, service_role;