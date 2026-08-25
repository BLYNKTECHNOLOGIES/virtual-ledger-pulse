export function normalizeRoleName(role?: string | null): string {
  return String(role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function isSuperAdminRoleName(role?: string | null): boolean {
  return normalizeRoleName(role) === 'superadmin';
}

export function isAdminRoleName(role?: string | null): boolean {
  const normalized = normalizeRoleName(role);
  return normalized === 'admin' || normalized === 'superadmin';
}

export function hasRoleName(roles: string[] | undefined | null, role: string): boolean {
  const target = normalizeRoleName(role);
  return Boolean(roles?.some((userRole) => normalizeRoleName(userRole) === target));
}