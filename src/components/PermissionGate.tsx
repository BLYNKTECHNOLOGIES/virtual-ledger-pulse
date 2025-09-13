
import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';

interface PermissionGateProps {
  permissions: string[];
  fallback?: ReactNode;
  requireAll?: boolean;
  children: ReactNode;
  showFallback?: boolean; // New prop to control fallback display
}

export function PermissionGate({ 
  permissions, 
  fallback, 
  requireAll = false, 
  showFallback = true,
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
    
    // Don't show any fallback if showFallback is false
    if (!showFallback) {
      return null;
    }
    
    return (
      <Card className="border-dashed border-gray-200">
        <CardContent className="p-4 text-center">
          <div className="space-y-2">
            <div className="text-gray-400">
              <Shield className="h-6 w-6 mx-auto mb-1 opacity-40" />
              <p className="text-xs text-gray-400">
                Insufficient permissions
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
