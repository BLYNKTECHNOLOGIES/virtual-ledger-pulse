CREATE OR REPLACE FUNCTION public.admin_reset_user_password(p_user_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_password_hash TEXT;
BEGIN
    -- Hash the new password using extensions schema
    v_password_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf'));
    
    -- Update the user's password
    UPDATE users
    SET 
        password_hash = v_password_hash,
        updated_at = now()
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;