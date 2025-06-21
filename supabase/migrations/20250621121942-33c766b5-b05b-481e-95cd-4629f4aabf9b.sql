
-- Step 1: Add missing enum values (this needs to be in a separate transaction)
DO $$ 
DECLARE
    existing_permissions text[];
    new_permissions text[] := ARRAY[
        'CREATE_USERS', 'READ_USERS', 'UPDATE_USERS', 'DELETE_USERS',
        'MANAGE_ROLES', 'MANAGE_SYSTEM', 'VIEW_REPORTS', 'MANAGE_CLIENTS',
        'MANAGE_LEADS', 'MANAGE_SALES', 'MANAGE_PURCHASE', 'MANAGE_STOCK',
        'MANAGE_ACCOUNTING', 'MANAGE_HRMS', 'MANAGE_PAYROLL', 'MANAGE_COMPLIANCE'
    ];
    perm text;
BEGIN
    -- Get existing enum values
    SELECT array_agg(enumlabel::text) INTO existing_permissions
    FROM pg_enum 
    WHERE enumtypid = 'app_permission'::regtype;
    
    -- Add missing permissions to the enum
    FOREACH perm IN ARRAY new_permissions
    LOOP
        IF NOT (perm = ANY(existing_permissions)) THEN
            EXECUTE format('ALTER TYPE app_permission ADD VALUE %L', perm);
        END IF;
    END LOOP;
END $$;
