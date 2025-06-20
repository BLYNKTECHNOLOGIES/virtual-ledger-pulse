
import { useAuth } from "./useAuth";
import { useEffect, useState } from "react";

export interface Permission {
  id: string;
  label: string;
  description: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
  { id: 'view_dashboard', label: 'View Dashboard', description: 'Access to main dashboard' },
  { id: 'view_sales', label: 'View Sales', description: 'Access to sales module' },
  { id: 'view_purchase', label: 'View Purchase', description: 'Access to purchase module' },
  { id: 'view_bams', label: 'View BAMS', description: 'Access to Bank Account Management System' },
  { id: 'view_clients', label: 'View Clients', description: 'Access to clients module' },
  { id: 'view_leads', label: 'View Leads', description: 'Access to leads module' },
  { id: 'view_user_management', label: 'View User Management', description: 'Access to user management' },
  { id: 'view_hrms', label: 'View HRMS', description: 'Access to HR Management System' },
  { id: 'view_payroll', label: 'View Payroll', description: 'Access to payroll module' },
  { id: 'view_compliance', label: 'View Compliance', description: 'Access to compliance module' },
  { id: 'view_stock_management', label: 'View Stock Management', description: 'Access to stock management' },
  { id: 'view_accounting', label: 'View Accounting', description: 'Access to accounting module' },
  { id: 'manage_users', label: 'Manage Users', description: 'Create, edit, and delete users' },
  { id: 'manage_roles', label: 'Manage Roles', description: 'Create and manage user roles' },
];

export function usePermissions() {
  const { user, userHasPermission } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (user?.permissions) {
      setPermissions(user.permissions);
    }
  }, [user?.permissions]);

  const hasPermission = (permission: string): boolean => {
    return userHasPermission(permission);
  };

  const hasAnyPermission = (requiredPermissions: string[]): boolean => {
    return requiredPermissions.some(permission => hasPermission(permission));
  };

  const canAccessPage = (page: string): boolean => {
    const pagePermissionMap: Record<string, string> = {
      '/': 'view_dashboard',
      '/sales': 'view_sales',
      '/purchase': 'view_purchase',
      '/bams': 'view_bams',
      '/clients': 'view_clients',
      '/leads': 'view_leads',
      '/user-management': 'view_user_management',
      '/hrms': 'view_hrms',
      '/payroll': 'view_payroll',
      '/compliance': 'view_compliance',
      '/stock-management': 'view_stock_management',
      '/accounting': 'view_accounting',
    };

    const requiredPermission = pagePermissionMap[page];
    return requiredPermission ? hasPermission(requiredPermission) : true;
  };

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    canAccessPage,
  };
}
