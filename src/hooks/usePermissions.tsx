
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isLoading: authLoading } = useAuth();

  const fetchPermissions = async () => {
    try {
      setIsLoading(true);
      
      if (authLoading) {
        return;
      }
      
      if (!user) {
        setPermissions([]);
        return;
      }
      
      // Check if user is super admin (role-based only)
      if (user.roles?.some(r => r.toLowerCase() === 'super admin')) {
        const adminPermissions = [
          'dashboard_view',
          'sales_view', 'sales_manage',
          'purchase_view', 'purchase_manage',
          'terminal_view', 'terminal_manage',
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
          'statistics_view', 'statistics_manage',
          'risk_management_view', 'risk_management_manage',
          'erp_destructive', 'terminal_destructive', 'bams_destructive',
          'clients_destructive', 'stock_destructive',
           'shift_reconciliation_create', 'shift_reconciliation_approve',
           'utility_view', 'utility_manage',
           'tasks_view', 'tasks_manage'
         ];
        setPermissions(adminPermissions);
        return;
      }

      // For database users, fetch permissions from role_permissions table
      
      const { data: userPermissions, error } = await supabase
        .rpc('get_user_permissions', { user_uuid: user.id });

      if (error) {
        console.error('Error fetching user permissions:', error);
        
        // Fallback: check if user has admin role from user object
        const isAdmin = user.roles?.some(role => role.toLowerCase() === 'admin');
        if (isAdmin) {
          const adminPermissions = [
            'dashboard_view',
            'sales_view', 'sales_manage',
            'purchase_view', 'purchase_manage',
            'terminal_view', 'terminal_manage',
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
            'statistics_view', 'statistics_manage',
            'risk_management_view', 'risk_management_manage',
            'erp_destructive', 'terminal_destructive', 'bams_destructive',
             'clients_destructive', 'stock_destructive',
             'shift_reconciliation_create', 'shift_reconciliation_approve',
             'utility_view', 'utility_manage',
             'tasks_view', 'tasks_manage'
           ];
          setPermissions(adminPermissions);
        } else {
          setPermissions(['dashboard_view']);
        }
        return;
      }

      if (userPermissions && Array.isArray(userPermissions)) {
        setPermissions(userPermissions.map(p => p.permission));
      } else {
        setPermissions(['dashboard_view']);
      }
      
    } catch (error) {
      console.error('Error fetching permissions:', error);
      setPermissions(['dashboard_view']);
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = useCallback((permission: string): boolean => {
    return permissions.includes(permission);
  }, [permissions]);

  const hasAnyPermission = useCallback((permissionList: string[]): boolean => {
    return permissionList.some(permission => permissions.includes(permission));
  }, [permissions]);

  const hasAllPermissions = useCallback((permissionList: string[]): boolean => {
    return permissionList.every(permission => permissions.includes(permission));
  }, [permissions]);

  useEffect(() => {
    fetchPermissions();
  }, [user, authLoading]);

  return {
    permissions,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refetchPermissions: fetchPermissions
  };
}
