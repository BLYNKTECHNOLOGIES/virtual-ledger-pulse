import { ReactNode } from 'react';
import { useTerminalAuth, TerminalPermission } from '@/hooks/useTerminalAuth';
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
