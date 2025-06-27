
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isLoading: authLoading } = useAuth();

  const fetchPermissions = async () => {
    try {
      setIsLoading(true);
      
      console.log('usePermissions - fetchPermissions called');
      console.log('usePermissions - user:', user);
      console.log('usePermissions - authLoading:', authLoading);
      
      if (authLoading) {
        console.log('usePermissions - still loading auth, waiting...');
        return;
      }
      
      if (!user) {
        console.log('usePermissions - no user found');
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
          'statistics_view', 'statistics_manage',
          'sheets_view', 'sheets_manage'
        ];
        console.log('usePermissions - setting demo admin permissions:', adminPermissions);
        setPermissions(adminPermissions);
        localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
        return;
      }

      // For database users, fetch permissions from role_permissions table
      console.log('usePermissions - fetching permissions from database for user:', user.id);
      
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
            'statistics_view', 'statistics_manage',
            'sheets_view', 'sheets_manage'
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
        console.log('usePermissions - fetched permissions from database:', permissionStrings);
        setPermissions(permissionStrings);
        localStorage.setItem('userPermissions', JSON.stringify(permissionStrings));
      } else {
        console.log('usePermissions - no permissions found, setting basic permissions');
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

  const hasPermission = (permission: string): boolean => {
    const result = permissions.includes(permission);
    console.log(`hasPermission(${permission}):`, result);
    return result;
  };

  const hasAnyPermission = (permissionList: string[]): boolean => {
    const result = permissionList.some(permission => permissions.includes(permission));
    console.log(`hasAnyPermission([${permissionList.join(', ')}]):`, result);
    return result;
  };

  const hasAllPermissions = (permissionList: string[]): boolean => {
    const result = permissionList.every(permission => permissions.includes(permission));
    console.log(`hasAllPermissions([${permissionList.join(', ')}]):`, result);
    return result;
  };

  useEffect(() => {
    console.log('usePermissions - useEffect triggered, user changed:', user);
    fetchPermissions();
  }, [user, authLoading]);

  console.log('usePermissions - current permissions:', permissions);
  console.log('usePermissions - isLoading:', isLoading);

  return {
    permissions,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refetchPermissions: fetchPermissions
  };
}
