
import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';

interface PermissionGateProps {
  permissions: string[];
  fallback?: ReactNode;
  requireAll?: boolean;
  children: ReactNode;
}

export function PermissionGate({ 
  permissions, 
  fallback, 
  requireAll = false, 
  children 
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading permissions...</span>
      </div>
    );
  }

  // Check permissions based on requirements
  let hasAccess = false;
  
  if (permissions.length === 1) {
    hasAccess = hasPermission(permissions[0]);
  } else if (requireAll) {
    hasAccess = hasAllPermissions(permissions);
  } else {
    hasAccess = hasAnyPermission(permissions);
  }

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <h3 className="text-lg font-medium">Access Denied</h3>
              <p className="text-sm">You don't have permission to access this content.</p>
              <p className="text-xs mt-2 text-gray-400">
                Required: {permissions.join(requireAll ? ' AND ' : ' OR ')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
