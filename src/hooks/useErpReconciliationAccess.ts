import { usePermissions } from '@/hooks/usePermissions';
import { hasReconciliationPermission } from '@/lib/umPresence';

/** Reconciliation access comes exclusively from the effective permission set. */
export function useErpReconciliationAccess() {
  const { permissions, isLoading } = usePermissions();
  return { hasAccess: !isLoading && hasReconciliationPermission(permissions), isLoading };
}
