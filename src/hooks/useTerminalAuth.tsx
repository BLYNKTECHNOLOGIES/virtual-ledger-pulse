import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type TerminalPermission =
  | 'terminal_dashboard_view'
  | 'terminal_ads_view'
  | 'terminal_ads_manage'
  | 'terminal_orders_view'
  | 'terminal_orders_manage'
  | 'terminal_orders_actions'
  | 'terminal_automation_view'
  | 'terminal_automation_manage'
  | 'terminal_analytics_view'
  | 'terminal_assets_view'
  | 'terminal_mpi_view'
  | 'terminal_audit_logs_view'
  | 'terminal_kyc_view'
  | 'terminal_kyc_manage'
  | 'terminal_logs_view'
  | 'terminal_settings_view'
  | 'terminal_settings_manage'
  | 'terminal_users_view'
  | 'terminal_users_manage'
  | 'terminal_payer_view'
  | 'terminal_payer_manage';

export interface TerminalRole {
  role_id: string;
  role_name: string;
  role_description: string | null;
}

interface TerminalAuthContextType {
  /** User identity synced from parent auth */
  userId: string | null;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  /** Terminal-specific */
  terminalRoles: TerminalRole[];
  terminalPermissions: TerminalPermission[];
  hasPermission: (perm: TerminalPermission) => boolean;
  hasAnyPermission: (perms: TerminalPermission[]) => boolean;
  isTerminalAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const TerminalAuthContext = createContext<TerminalAuthContextType | undefined>(undefined);

export function useTerminalAuth() {
  const ctx = useContext(TerminalAuthContext);
  if (!ctx) throw new Error('useTerminalAuth must be used within TerminalAuthProvider');
  return ctx;
}

export function TerminalAuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: parentLoading } = useAuth();
  const [terminalRoles, setTerminalRoles] = useState<TerminalRole[]>([]);
  const [terminalPermissions, setTerminalPermissions] = useState<TerminalPermission[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTerminalAuth = useCallback(async () => {
    if (parentLoading) return;
    if (!user?.id) {
      setTerminalRoles([]);
      setTerminalPermissions([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Validate UUID format before RPC call
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user.id)) {
        setTerminalRoles([]);
        setTerminalPermissions([]);
        setIsSuperAdmin(false);
        return;
      }

      // Fetch terminal roles, permissions, AND check ERP role from DB directly
      const [rolesRes, permsRes, erpRolesRes] = await Promise.all([
        supabase.rpc('get_terminal_user_roles', { p_user_id: user.id }),
        supabase.rpc('get_terminal_permissions', { p_user_id: user.id }),
        supabase.rpc('get_user_with_roles', { user_uuid: user.id }),
      ]);

      if (rolesRes.data && Array.isArray(rolesRes.data)) {
        setTerminalRoles(rolesRes.data as TerminalRole[]);
      } else {
        setTerminalRoles([]);
      }

      if (permsRes.data && Array.isArray(permsRes.data)) {
        const perms = permsRes.data.map((p: any) => p.permission as TerminalPermission);
        setTerminalPermissions(perms);
      } else {
        setTerminalPermissions([]);
      }

      // Check Super Admin from DB roles (not cached session)
      let dbIsSuperAdmin = false;
      if (erpRolesRes.data && Array.isArray(erpRolesRes.data) && erpRolesRes.data.length > 0) {
        const erpUser = erpRolesRes.data[0] as any;
        if (erpUser.roles && Array.isArray(erpUser.roles)) {
          dbIsSuperAdmin = erpUser.roles.some((r: any) => {
            const name = typeof r === 'string' ? r : r.name;
            return name?.toLowerCase() === 'super admin';
          });
        }
      }
      // Also check from cached session as fallback
      const sessionIsSuperAdmin = user?.roles?.some(r => r.toLowerCase() === 'super admin') || false;
      setIsSuperAdmin(dbIsSuperAdmin || sessionIsSuperAdmin);

    } catch (err) {
      console.error('Error fetching terminal auth:', err);
      setTerminalRoles([]);
      setTerminalPermissions([]);
      setIsSuperAdmin(false);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, parentLoading]);

  useEffect(() => {
    fetchTerminalAuth();
  }, [fetchTerminalAuth]);

  // isSuperAdmin is now managed as state, set during fetchTerminalAuth

  const isTerminalAdmin = isSuperAdmin || terminalRoles.some(
    (r) => r.role_name.toLowerCase() === 'admin' || r.role_name.toLowerCase() === 'super admin'
  );

  const ALL_TERMINAL_PERMISSIONS: TerminalPermission[] = [
    'terminal_dashboard_view', 'terminal_ads_view', 'terminal_ads_manage',
    'terminal_orders_view', 'terminal_orders_manage', 'terminal_orders_actions',
    'terminal_automation_view', 'terminal_automation_manage',
    'terminal_analytics_view', 'terminal_assets_view', 'terminal_mpi_view',
    'terminal_audit_logs_view', 'terminal_kyc_view', 'terminal_kyc_manage',
    'terminal_logs_view', 'terminal_settings_view', 'terminal_settings_manage',
    'terminal_users_view', 'terminal_users_manage',
    'terminal_payer_view', 'terminal_payer_manage',
  ];

  const effectivePermissions = isSuperAdmin ? ALL_TERMINAL_PERMISSIONS : terminalPermissions;

  const hasPermission = useCallback(
    (perm: TerminalPermission) => isSuperAdmin || terminalPermissions.includes(perm),
    [terminalPermissions, isSuperAdmin]
  );

  const hasAnyPermission = useCallback(
    (perms: TerminalPermission[]) => isSuperAdmin || perms.some((p) => terminalPermissions.includes(p)),
    [terminalPermissions, isSuperAdmin]
  );

  const value: TerminalAuthContextType = {
    userId: user?.id || null,
    username: user?.username || null,
    email: user?.email || null,
    firstName: user?.firstName || null,
    lastName: user?.lastName || null,
    avatarUrl: user?.avatar_url || null,
    terminalRoles,
    terminalPermissions: effectivePermissions,
    hasPermission,
    hasAnyPermission,
    isTerminalAdmin,
    isSuperAdmin,
    isLoading: parentLoading || isLoading,
    refetch: fetchTerminalAuth,
  };

  return (
    <TerminalAuthContext.Provider value={value}>
      {children}
    </TerminalAuthContext.Provider>
  );
}
