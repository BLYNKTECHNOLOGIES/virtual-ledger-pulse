-- Drop existing function variants and create a fixed version
DROP FUNCTION IF EXISTS public.approve_registration(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.approve_registration(uuid, uuid);
DROP FUNCTION IF EXISTS public.approve_registration(uuid);

CREATE OR REPLACE FUNCTION public.approve_registration(
    p_registration_id uuid,
    p_role_id uuid,
    p_approved_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registration RECORD;
    v_user_id UUID;
BEGIN
    -- Get registration details (accept both PENDING cases)
    SELECT * INTO v_registration
    FROM pending_registrations
    WHERE id = p_registration_id 
      AND status IN ('PENDING', 'pending');
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registration not found or already processed';
    END IF;
    
    -- Create the user
    INSERT INTO users (
        username,
        email,
        first_name,
        last_name,
        phone,
        password_hash,
        status,
        role_id,
        created_at,
        updated_at
    ) VALUES (
        v_registration.username,
        v_registration.email,
        v_registration.first_name,
        v_registration.last_name,
        v_registration.phone,
        v_registration.password_hash,
        'ACTIVE',
        p_role_id,
        now(),
        now()
    ) RETURNING id INTO v_user_id;
    
    -- Also add to user_roles table
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_user_id, p_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
    
    -- Update registration status (only use columns that exist)
    UPDATE pending_registrations
    SET 
        status = 'APPROVED',
        reviewed_by = p_approved_by,
        reviewed_at = now()
    WHERE id = p_registration_id;
    
    RETURN v_user_id;
END;
$$;