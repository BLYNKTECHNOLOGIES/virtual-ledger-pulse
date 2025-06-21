
-- Step 2: Create Admin role and user with all permissions (handling existing admin user)
-- Create Admin role if it doesn't exist
INSERT INTO public.roles (name, description, is_system_role) 
VALUES ('Admin', 'Full system access with all permissions', true)
ON CONFLICT (name) DO NOTHING;

-- Get the Admin role ID and assign all available permissions
DO $$
DECLARE
    admin_role_id uuid;
    perm_record record;
BEGIN
    SELECT id INTO admin_role_id FROM public.roles WHERE name = 'Admin';
    
    -- Insert all available permissions for Admin role
    FOR perm_record IN 
        SELECT enumlabel::text as permission_name
        FROM pg_enum 
        WHERE enumtypid = 'app_permission'::regtype
    LOOP
        INSERT INTO public.role_permissions (role_id, permission) 
        VALUES (admin_role_id, perm_record.permission_name::app_permission)
        ON CONFLICT (role_id, permission) DO NOTHING;
    END LOOP;
END $$;

-- Update or create the admin user (handle existing username)
DO $$
DECLARE
    admin_user_id uuid;
    admin_role_id uuid;
BEGIN
    -- Try to update existing admin user first
    UPDATE public.users 
    SET 
        email = 'blynkvirtualtechnologiespvtld@gmail.com',
        first_name = 'System',
        last_name = 'Administrator',
        password_hash = crypt('Blynk@0717', gen_salt('bf')),
        status = 'ACTIVE',
        email_verified = true
    WHERE username = 'admin'
    RETURNING id INTO admin_user_id;
    
    -- If no existing admin user, create one with a unique username
    IF admin_user_id IS NULL THEN
        INSERT INTO public.users (
            username, 
            email, 
            first_name, 
            last_name, 
            password_hash, 
            status, 
            email_verified
        ) VALUES (
            'system_admin',
            'blynkvirtualtechnologiespvtld@gmail.com',
            'System',
            'Administrator',
            crypt('Blynk@0717', gen_salt('bf')),
            'ACTIVE',
            true
        ) RETURNING id INTO admin_user_id;
    END IF;
    
    -- Get Admin role ID and assign it to the user
    SELECT id INTO admin_role_id FROM public.roles WHERE name = 'Admin';
    
    INSERT INTO public.user_roles (user_id, role_id, assigned_by)
    VALUES (admin_user_id, admin_role_id, 'system')
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;
