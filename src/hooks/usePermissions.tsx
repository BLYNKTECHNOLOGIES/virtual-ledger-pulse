
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isStandbyRoles } from '@/hooks/useIsStandby';
import { ADMIN_PERMISSIONS, expandPermissions } from '@/lib/permissions/catalog';


const permissionCache = new Map<string, string[]>();

const PERMISSION_STORAGE_PREFIX = 'blynk_permissions_';

function readPersistedPermissions(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(PERMISSION_STORAGE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function persistPermissions(userId: string, perms: string[]) {
  permissionCache.set(userId, perms);
  try {
    localStorage.setItem(PERMISSION_STORAGE_PREFIX + userId, JSON.stringify(perms));
  } catch {
    /* ignore quota errors */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usePermissions() {
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id || null;
  const cachedPermissions = userId
    ? permissionCache.get(userId) || readPersistedPermissions(userId) || undefined
    : undefined;
  const [permissions, setPermissions] = useState<string[]>(cachedPermissions || []);
  const [isLoading, setIsLoading] = useState(!cachedPermissions);
  const [isDegraded, setIsDegraded] = useState(false);

  const fetchPermissions = useCallback(async () => {
    try {
      if (authLoading) {
        return;
      }
      
      if (!user) {
        setPermissions([]);
        setIsLoading(false);
        return;
      }

      // Standby role: no business permissions at all — profile section only.
      if (isStandbyRoles(user.roles)) {
        persistPermissions(user.id, []);
        setPermissions([]);
        setIsDegraded(false);
        setIsLoading(false);
        return;
      }

      const cached = permissionCache.get(user.id) || readPersistedPermissions(user.id);

      if (cached) {
        permissionCache.set(user.id, cached);
        setPermissions(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      
      // Check if user is super admin (role-based only)
      if (user.roles?.some(r => r.toLowerCase() === 'super admin')) {
        persistPermissions(user.id, ADMIN_PERMISSIONS);
        setPermissions(ADMIN_PERMISSIONS);
        setIsDegraded(false);
        return;
      }

      // For database users, fetch permissions from role_permissions table.
      // Retry with backoff: transient backend outages must never permanently
      // downgrade a user to dashboard-only access.
      let userPermissions: any = null;
      let error: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await supabase.rpc('get_user_permissions', { user_uuid: user.id });
        userPermissions = res.data;
        error = res.error;
        if (!error) break;
        if (attempt < 2) await sleep(1500 * (attempt + 1));
      }

      if (error) {
        console.error('Error fetching user permissions:', error);

        // Fallback: check if user has admin role from user object
        const isAdmin = user.roles?.some(role => role.toLowerCase() === 'admin');
        if (isAdmin) {
          persistPermissions(user.id, ADMIN_PERMISSIONS);
          setPermissions(ADMIN_PERMISSIONS);
          setIsDegraded(false);
          return;
        }

        // Keep whatever we last knew (memory or localStorage) instead of
        // poisoning the cache with a dashboard-only set.
        const lastKnown = permissionCache.get(user.id) || readPersistedPermissions(user.id);
        setPermissions(lastKnown && lastKnown.length > 0 ? lastKnown : ['dashboard_view']);
        setIsDegraded(true);
        return;
      }

      if (userPermissions && Array.isArray(userPermissions) && userPermissions.length > 0) {
        // Normalize legacy keys and resolve umbrella/implied grants so that a
        // role holding e.g. accounting_view keeps Tax/P&L/Financials access.
        const fetchedPermissions = expandPermissions(userPermissions.map((p: any) => p.permission));
        persistPermissions(user.id, fetchedPermissions);
        setPermissions(fetchedPermissions);
        setIsDegraded(false);

      } else {
        // Genuine empty result from the backend — authoritative.
        persistPermissions(user.id, ['dashboard_view']);
        setPermissions(['dashboard_view']);
        setIsDegraded(false);
      }
      
    } catch (error) {
      console.error('Error fetching permissions:', error);
      const lastKnown = user ? permissionCache.get(user.id) || readPersistedPermissions(user.id) : null;
      setPermissions(lastKnown && lastKnown.length > 0 ? lastKnown : ['dashboard_view']);
      setIsDegraded(true);
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, user]);

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
  }, [fetchPermissions]);

  return {
    permissions,
    isLoading,
    isDegraded,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refetchPermissions: fetchPermissions
  };
}
