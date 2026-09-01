import { ReactNode, useRef } from 'react';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import type { TerminalPermission } from '@/lib/permissions/terminalCatalog';
import { Shield } from 'lucide-react';

interface Props {
  permissions: TerminalPermission[];
  requireAll?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
  silent?: boolean; // If true, renders nothing when denied
}

export function TerminalPermissionGate({
  permissions,
  requireAll = false,
  children,
  fallback,
  silent = false,
}: Props) {
  const { hasPermission, hasAnyPermission, isLoading } = useTerminalAuth();
  // Once children have rendered, a background revalidation (e.g. the Supabase
  // TOKEN_REFRESHED fired when the operator returns from another browser tab)
  // must never unmount them — that would destroy an open order chat workspace.
  const hasRenderedRef = useRef(false);
  if (!isLoading) hasRenderedRef.current = true;
  if (isLoading && hasRenderedRef.current) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  const hasAccess =
    permissions.length === 1
      ? hasPermission(permissions[0])
      : requireAll
        ? permissions.every((p) => hasPermission(p))
        : hasAnyPermission(permissions);

  if (!hasAccess) {
    if (fallback) return <>{fallback}</>;
    if (silent) return null;
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Shield className="h-8 w-8 opacity-30" />
        <p className="text-xs">You don't have permission to access this.</p>
      </div>
    );
  }

  return <>{children}</>;
}
