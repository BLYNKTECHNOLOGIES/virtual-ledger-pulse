import { useAuth } from '@/hooks/useAuth';

/** Role name (case-insensitive) that is restricted to the profile section only. */
export const STANDBY_ROLE = 'standby';

export function isStandbyRoles(roles?: string[] | null): boolean {
  if (!roles || roles.length === 0) return false;
  const normalized = roles.map((r) => String(r).trim().toLowerCase());
  // Super Admin / Admin always wins, even if a standby role is also attached.
  if (normalized.some((r) => r === 'super admin' || r === 'admin')) return false;
  return normalized.some((r) => r === STANDBY_ROLE);
}

/** Paths a standby user may reach. Everything else redirects to /profile. */
export const STANDBY_ALLOWED_PATHS = ['/profile'];

export function isStandbyAllowedPath(pathname: string): boolean {
  return STANDBY_ALLOWED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function useIsStandby() {
  const { user, isLoading } = useAuth();
  return { isStandby: isStandbyRoles(user?.roles), isLoading };
}
