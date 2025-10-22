-- Add stock_view permission to Auditor role
DO $$
DECLARE
    auditor_role_id UUID;
BEGIN
    -- Get the Auditor role ID
    SELECT id INTO auditor_role_id FROM roles WHERE name = 'Auditor';
    
    IF auditor_role_id IS NOT NULL THEN
        -- Update the Auditor role with all permissions including stock_view
        PERFORM update_role_permissions(
            auditor_role_id,
            'Auditor',
            'View-only access to compliance and stock management',
            ARRAY[
                'dashboard_view',
                'sales_view',
                'sales_manage',
                'purchase_view',
                'bams_view',
                'clients_view',
                'compliance_view',
                'stock_view',
                'stock_manage'
            ]
        );
        
        RAISE NOTICE 'Successfully added stock_view permission to Auditor role';
    ELSE
        RAISE NOTICE 'Auditor role not found';
    END IF;
END $$;