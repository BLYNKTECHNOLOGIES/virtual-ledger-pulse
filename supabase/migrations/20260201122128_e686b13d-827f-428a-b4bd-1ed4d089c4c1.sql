-- Create function to hash password for registration (uses same algorithm as existing user creation)
CREATE OR REPLACE FUNCTION public.register_user_request(
    p_first_name TEXT,
    p_last_name TEXT,
    p_username TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_password TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registration_id UUID;
    v_password_hash TEXT;
BEGIN
    -- Check if username already exists in users table
    IF EXISTS (SELECT 1 FROM users WHERE username = p_username) THEN
        RAISE EXCEPTION 'Username already exists';
    END IF;
    
    -- Check if email already exists in users table
    IF EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
        RAISE EXCEPTION 'Email already exists';
    END IF;
    
    -- Check if username already exists in pending registrations
    IF EXISTS (SELECT 1 FROM pending_registrations WHERE username = p_username AND status = 'pending') THEN
        RAISE EXCEPTION 'A registration request with this username is already pending';
    END IF;
    
    -- Check if email already exists in pending registrations
    IF EXISTS (SELECT 1 FROM pending_registrations WHERE email = p_email AND status = 'pending') THEN
        RAISE EXCEPTION 'A registration request with this email is already pending';
    END IF;
    
    -- Hash the password using the same method as existing system
    v_password_hash := crypt(p_password, gen_salt('bf'));
    
    -- Insert the registration request
    INSERT INTO pending_registrations (
        first_name,
        last_name,
        username,
        email,
        phone,
        password_hash
    ) VALUES (
        p_first_name,
        p_last_name,
        p_username,
        p_email,
        p_phone,
        v_password_hash
    ) RETURNING id INTO v_registration_id;
    
    RETURN v_registration_id;
END;
$$;

-- Create function to approve registration and create user
CREATE OR REPLACE FUNCTION public.approve_registration(
    p_registration_id UUID,
    p_role_id UUID,
    p_approved_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registration RECORD;
    v_user_id UUID;
BEGIN
    -- Get registration details
    SELECT * INTO v_registration
    FROM pending_registrations
    WHERE id = p_registration_id AND status = 'pending';
    
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
        role_id
    ) VALUES (
        v_registration.username,
        v_registration.email,
        v_registration.first_name,
        v_registration.last_name,
        v_registration.phone,
        v_registration.password_hash,
        'ACTIVE',
        p_role_id
    ) RETURNING id INTO v_user_id;
    
    -- Also add to user_roles table
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_user_id, p_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
    
    -- Update registration status
    UPDATE pending_registrations
    SET 
        status = 'approved',
        assigned_role_id = p_role_id,
        reviewed_by = p_approved_by,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_registration_id;
    
    RETURN v_user_id;
END;
$$;

-- Create function to reject registration
CREATE OR REPLACE FUNCTION public.reject_registration(
    p_registration_id UUID,
    p_rejected_by UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE pending_registrations
    SET 
        status = 'rejected',
        rejection_reason = p_reason,
        reviewed_by = p_rejected_by,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_registration_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Create function for admin to reset user password
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_password_hash TEXT;
BEGIN
    -- Hash the new password
    v_password_hash := crypt(p_new_password, gen_salt('bf'));
    
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