
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
      
      // Check if user is demo admin (hardcoded permissions)
      if (user.id === 'demo-admin-id' || user.email === 'blynkvirtualtechnologiespvtld@gmail.com') {
        const adminPermissions = [
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
        ];
        setPermissions(adminPermissions);
        localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
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
          ];
          setPermissions(adminPermissions);
          localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
        } else {
          // Default permissions for regular users
          const basicPermissions = ['dashboard_view'];
          setPermissions(basicPermissions);
          localStorage.setItem('userPermissions', JSON.stringify(basicPermissions));
        }
        return;
      }

      if (userPermissions && Array.isArray(userPermissions)) {
        const permissionStrings = userPermissions.map(p => p.permission);
        setPermissions(permissionStrings);
        localStorage.setItem('userPermissions', JSON.stringify(permissionStrings));
      } else {
        const basicPermissions = ['dashboard_view'];
        setPermissions(basicPermissions);
        localStorage.setItem('userPermissions', JSON.stringify(basicPermissions));
      }
      
    } catch (error) {
      console.error('Error fetching permissions:', error);
      
      // Fallback to basic permissions
      const basicPermissions = ['dashboard_view'];
      setPermissions(basicPermissions);
      localStorage.setItem('userPermissions', JSON.stringify(basicPermissions));
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
