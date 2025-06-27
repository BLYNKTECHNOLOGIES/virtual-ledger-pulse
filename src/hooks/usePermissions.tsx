
import { useState, useEffect } from 'react';

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = () => {
    try {
      setIsLoading(true);
      
      // Check if user is logged in
      const isLoggedIn = localStorage.getItem('isLoggedIn');
      const userEmail = localStorage.getItem('userEmail');
      const storedPermissions = localStorage.getItem('userPermissions');
      
      console.log('usePermissions - isLoggedIn:', isLoggedIn);
      console.log('usePermissions - userEmail:', userEmail);
      console.log('usePermissions - storedPermissions:', storedPermissions);
      
      if (isLoggedIn === 'true' && userEmail) {
        if (storedPermissions) {
          const parsedPermissions = JSON.parse(storedPermissions);
          console.log('usePermissions - parsed permissions:', parsedPermissions);
          setPermissions(parsedPermissions);
        } else {
          // Fallback for admin user
          const isAdmin = userEmail === 'blynkvirtualtechnologiespvtld@gmail.com';
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
            // Store for future use
            localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
          }
        }
      } else {
        setPermissions([]);
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
    fetchPermissions();
  }, []);

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
