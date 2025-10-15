
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
          'VIEW_DASHBOARD',
          'VIEW_SALES', 'MANAGE_SALES',
          'VIEW_PURCHASE', 'MANAGE_PURCHASE',
          'VIEW_BAMS', 'MANAGE_BAMS',
          'VIEW_CLIENTS', 'MANAGE_CLIENTS',
          'VIEW_LEADS', 'MANAGE_LEADS',
          'VIEW_USER_MANAGEMENT', 'MANAGE_USER_MANAGEMENT',
          'VIEW_HRMS', 'MANAGE_HRMS',
          'VIEW_PAYROLL', 'MANAGE_PAYROLL',
          'VIEW_COMPLIANCE', 'MANAGE_COMPLIANCE',
          'VIEW_STOCK', 'MANAGE_STOCK',
          'VIEW_ACCOUNTING', 'MANAGE_ACCOUNTING',
          'VIEW_VIDEO_KYC', 'MANAGE_VIDEO_KYC',
          'VIEW_KYC_APPROVALS', 'MANAGE_KYC_APPROVALS',
          'VIEW_STATISTICS', 'MANAGE_STATISTICS',
          'VIEW_FINANCIALS', 'MANAGE_FINANCIALS',
          'VIEW_RISK_MANAGEMENT', 'MANAGE_RISK_MANAGEMENT',
          'VIEW_EMS', 'MANAGE_EMS'
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
            'VIEW_DASHBOARD',
            'VIEW_SALES', 'MANAGE_SALES',
            'VIEW_PURCHASE', 'MANAGE_PURCHASE',
            'VIEW_BAMS', 'MANAGE_BAMS',
            'VIEW_CLIENTS', 'MANAGE_CLIENTS',
            'VIEW_LEADS', 'MANAGE_LEADS',
            'VIEW_USER_MANAGEMENT', 'MANAGE_USER_MANAGEMENT',
            'VIEW_HRMS', 'MANAGE_HRMS',
            'VIEW_PAYROLL', 'MANAGE_PAYROLL',
            'VIEW_COMPLIANCE', 'MANAGE_COMPLIANCE',
            'VIEW_STOCK', 'MANAGE_STOCK',
            'VIEW_ACCOUNTING', 'MANAGE_ACCOUNTING',
            'VIEW_VIDEO_KYC', 'MANAGE_VIDEO_KYC',
            'VIEW_KYC_APPROVALS', 'MANAGE_KYC_APPROVALS',
            'VIEW_STATISTICS', 'MANAGE_STATISTICS',
            'VIEW_FINANCIALS', 'MANAGE_FINANCIALS',
            'VIEW_RISK_MANAGEMENT', 'MANAGE_RISK_MANAGEMENT',
            'VIEW_EMS', 'MANAGE_EMS'
          ];
          setPermissions(adminPermissions);
          localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
        } else {
          // Default permissions for regular users
          const basicPermissions = ['VIEW_DASHBOARD'];
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
        const basicPermissions = ['VIEW_DASHBOARD'];
        setPermissions(basicPermissions);
        localStorage.setItem('userPermissions', JSON.stringify(basicPermissions));
      }
      
    } catch (error) {
      console.error('Error fetching permissions:', error);
      
      // Fallback to basic permissions
      const basicPermissions = ['VIEW_DASHBOARD'];
      setPermissions(basicPermissions);
      localStorage.setItem('userPermissions', JSON.stringify(basicPermissions));
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: string[]): boolean => {
    return permissionList.some(permission => permissions.includes(permission));
  };

  const hasAllPermissions = (permissionList: string[]): boolean => {
    return permissionList.every(permission => permissions.includes(permission));
  };

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
