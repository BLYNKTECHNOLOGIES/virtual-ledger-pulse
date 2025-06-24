
-- First, let's drop any existing policies that might be using the permission column
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;

-- Now let's handle the enum creation more carefully
DO $$ 
DECLARE
    enum_exists BOOLEAN;
BEGIN
    -- Check if the enum already exists
    SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'app_permission'
    ) INTO enum_exists;
    
    -- If enum doesn't exist, create it
    IF NOT enum_exists THEN
        CREATE TYPE app_permission AS ENUM (
            'dashboard_view',
            'sales_view', 'sales_manage',
            'purchase_view', 'purchase_manage', 
            'bams_view', 'bams_manage',
            'clients_view', 'clients_manage',
            'leads_view', 'leads_manage',
            'user_management_view', 'user_management_manage',
            'hrms_view', 'hrms_manage',
            'payroll_view', 'payroll_manage',
            'compliance_view', 'compliance_manage',
            'stock_view', 'stock_manage',
            'accounting_view', 'accounting_manage',
            'video_kyc_view', 'video_kyc_manage',
            'kyc_approvals_view', 'kyc_approvals_manage',
            'statistics_view', 'statistics_manage'
        );
        
        -- Update role_permissions table to use the enum
        ALTER TABLE role_permissions 
        ALTER COLUMN permission TYPE app_permission USING permission::text::app_permission;
    END IF;
END $$;

-- Create a function to add permissions when creating a role
CREATE OR REPLACE FUNCTION create_role_with_permissions(
    role_name TEXT,
    role_description TEXT,
    permissions TEXT[]
) RETURNS UUID AS $$
DECLARE
    new_role_id UUID;
    perm TEXT;
BEGIN
    -- Insert the role
    INSERT INTO roles (name, description, is_system_role)
    VALUES (role_name, role_description, false)
    RETURNING id INTO new_role_id;
    
    -- Insert permissions
    FOREACH perm IN ARRAY permissions
    LOOP
        INSERT INTO role_permissions (role_id, permission)
        VALUES (new_role_id, perm::app_permission);
    END LOOP;
    
    RETURN new_role_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to update role permissions
CREATE OR REPLACE FUNCTION update_role_permissions(
    role_id UUID,
    role_name TEXT,
    role_description TEXT,
    permissions TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
    perm TEXT;
BEGIN
    -- Update role basic info
    UPDATE roles 
    SET name = role_name, 
        description = role_description,
        updated_at = NOW()
    WHERE id = role_id;
    
    -- Delete existing permissions
    DELETE FROM role_permissions WHERE role_id = role_id;
    
    -- Insert new permissions
    FOREACH perm IN ARRAY permissions
    LOOP
        INSERT INTO role_permissions (role_id, permission)
        VALUES (role_id, perm::app_permission);
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user has specific permission
CREATE OR REPLACE FUNCTION user_has_permission(user_uuid UUID, check_permission app_permission)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        WHERE ur.user_id = user_uuid 
        AND rp.permission = check_permission
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create function to get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(user_uuid UUID)
RETURNS TABLE(permission app_permission) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT rp.permission
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
