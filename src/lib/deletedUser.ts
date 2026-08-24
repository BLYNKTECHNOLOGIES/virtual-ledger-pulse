/**
 * Deleted ERP accounts are kept as anonymized tombstones when they are attached to
 * immutable ledger rows (first_name = 'DELETED:', username = 'deleted_<uuid>').
 * Those tombstones must never appear in operational pickers or assignment lists.
 */
export interface MaybeDeletedUser {
  id?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  email?: string | null;
}

export function isDeletedErpUser(u?: MaybeDeletedUser | null): boolean {
  if (!u) return false;
  const first = (u.first_name || '').trim().toUpperCase();
  const username = (u.username || '').toLowerCase();
  const email = (u.email || '').toLowerCase();
  return (
    first.startsWith('DELETED') ||
    username.startsWith('deleted_') ||
    email.startsWith('deleted+')
  );
}

export function filterOutDeletedUsers<T extends MaybeDeletedUser>(users: T[] | null | undefined): T[] {
  return (users || []).filter((u) => !isDeletedErpUser(u));
}
