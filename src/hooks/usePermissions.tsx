
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isLoading: authLoading } = useAuth();

  const fetchPermissions = () => {
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
      
      // Check if user is admin
      const isAdmin = user.roles?.some(role => role.toLowerCase() === 'admin');
      console.log('usePermissions - isAdmin:', isAdmin);
      
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
        console.log('usePermissions - setting admin permissions:', adminPermissions);
        setPermissions(adminPermissions);
        
        // Also store in localStorage for compatibility
        localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
      } else {
        // For non-admin users, try to get from localStorage or set basic permissions
        const storedPermissions = localStorage.getItem('userPermissions');
        if (storedPermissions) {
          const parsedPermissions = JSON.parse(storedPermissions);
          console.log('usePermissions - using stored permissions:', parsedPermissions);
          setPermissions(parsedPermissions);
        } else {
          // Basic user permissions
          const basicPermissions = ['dashboard_view'];
          console.log('usePermissions - setting basic permissions:', basicPermissions);
          setPermissions(basicPermissions);
        }
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
      setPermissions([]);
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
