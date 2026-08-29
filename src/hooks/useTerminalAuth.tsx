import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ALL_TERMINAL_PERMISSIONS, type TerminalPermission } from '@/lib/permissions/terminalCatalog';
import { isSuperAdminRoleName } from '@/lib/auth/roles';

export type { TerminalPermission } from '@/lib/permissions/terminalCatalog';

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
  // After the first successful load, keep the previous roles/permissions in
  // place while revalidating. Tab focus triggers a Supabase TOKEN_REFRESHED
  // event upstream, which re-runs this fetch — flipping isLoading back to true
  // would unmount every TerminalPermissionGate child (e.g. the Orders page
  // with an open chat workspace) and destroy its state.
  const hasLoadedRef = useRef(false);

  const fetchTerminalAuth = useCallback(async () => {
    if (parentLoading) return;
    const sessionIsSuperAdmin = user?.roles?.some(isSuperAdminRoleName) || false;
    if (!user?.id) {
      setTerminalRoles([]);
      setTerminalPermissions([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    try {
      if (!hasLoadedRef.current) setIsLoading(true);

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
        const perms = permsRes.data.map((p: any) =>
          (typeof p === 'string' ? p : p.get_terminal_permissions || p.permission || p) as TerminalPermission
        );
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
            return isSuperAdminRoleName(name);
          });
        }
      }
      // Also check from cached session as fallback
      setIsSuperAdmin(dbIsSuperAdmin || sessionIsSuperAdmin);

    } catch (err) {
      console.error('Error fetching terminal auth:', err);
      setTerminalRoles([]);
      setTerminalPermissions([]);
      setIsSuperAdmin(sessionIsSuperAdmin);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.roles, parentLoading]);

  useEffect(() => {
    fetchTerminalAuth();
  }, [fetchTerminalAuth]);

  // isSuperAdmin is now managed as state, set during fetchTerminalAuth

  const isTerminalAdmin = isSuperAdmin || terminalRoles.some(
    (r) => r.role_name.toLowerCase() === 'admin' || r.role_name.toLowerCase() === 'super admin'
  );

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
