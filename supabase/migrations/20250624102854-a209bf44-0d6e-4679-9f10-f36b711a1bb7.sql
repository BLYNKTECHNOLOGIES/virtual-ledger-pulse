
-- First, let's see what enum values currently exist and add all the missing ones
DO $$ 
BEGIN
    -- Add all missing enum values one by one, ignoring errors if they already exist
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'sales_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'sales_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'purchase_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'purchase_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'bams_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'bams_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'clients_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'clients_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'leads_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'leads_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'user_management_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'user_management_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'hrms_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'hrms_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'payroll_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'payroll_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'compliance_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'compliance_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'stock_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'stock_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'accounting_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'accounting_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'video_kyc_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'video_kyc_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'kyc_approvals_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'kyc_approvals_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'statistics_view';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER TYPE app_permission ADD VALUE 'statistics_manage';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;
