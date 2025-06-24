
-- Drop and recreate the update_role_permissions function with proper parameter naming
DROP FUNCTION IF EXISTS update_role_permissions(uuid, text, text, text[]);

CREATE OR REPLACE FUNCTION update_role_permissions(
    p_role_id UUID,
    p_role_name TEXT,
    p_role_description TEXT,
    p_permissions TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
    perm TEXT;
BEGIN
    -- Update role basic info
    UPDATE roles 
    SET name = p_role_name, 
        description = p_role_description,
        updated_at = NOW()
    WHERE id = p_role_id;
    
    -- Delete existing permissions (using table qualification to avoid ambiguity)
    DELETE FROM role_permissions WHERE role_permissions.role_id = p_role_id;
    
    -- Insert new permissions
    FOREACH perm IN ARRAY p_permissions
    LOOP
        INSERT INTO role_permissions (role_id, permission)
        VALUES (p_role_id, perm::app_permission);
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now create or update admin role with all correct permissions
DO $$
DECLARE
    admin_role_id UUID;
    current_user_id UUID;
BEGIN
    -- Check if admin role already exists
    SELECT id INTO admin_role_id FROM roles WHERE name = 'Admin';
    
    -- If admin role doesn't exist, create it
    IF admin_role_id IS NULL THEN
        SELECT create_role_with_permissions(
            'Admin',
            'System Administrator with full access to all modules',
            ARRAY[
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
            ]::text[]
        ) INTO admin_role_id;
        
        -- Assign admin role to the demo admin user
        SELECT id INTO current_user_id FROM users WHERE email = 'blynkvirtualtechnologiespvtld@gmail.com';
        
        IF current_user_id IS NOT NULL THEN
            -- Remove any existing role assignments for this user
            DELETE FROM user_roles WHERE user_id = current_user_id;
            
            -- Assign admin role
            INSERT INTO user_roles (user_id, role_id, assigned_by)
            VALUES (current_user_id, admin_role_id, 'SYSTEM');
        END IF;
    ELSE
        -- Admin role exists, just ensure it has all permissions
        PERFORM update_role_permissions(
            admin_role_id,
            'Admin',
            'System Administrator with full access to all modules',
            ARRAY[
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
            ]::text[]
        );
        
        -- Assign admin role to the demo admin user if not already assigned
        SELECT id INTO current_user_id FROM users WHERE email = 'blynkvirtualtechnologiespvtld@gmail.com';
        
        IF current_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM user_roles WHERE user_id = current_user_id AND role_id = admin_role_id
        ) THEN
            -- Remove any existing role assignments for this user
            DELETE FROM user_roles WHERE user_id = current_user_id;
            
            -- Assign admin role
            INSERT INTO user_roles (user_id, role_id, assigned_by)
            VALUES (current_user_id, admin_role_id, 'SYSTEM');
        END IF;
    END IF;
END $$;
