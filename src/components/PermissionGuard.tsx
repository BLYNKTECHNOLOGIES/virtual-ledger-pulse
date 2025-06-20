
import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface PermissionGuardProps {
  children: ReactNode;
  requiredPermission: string;
  fallback?: ReactNode;
}

export function PermissionGuard({ 
  children, 
  requiredPermission, 
  fallback 
}: PermissionGuardProps) {
  const { hasPermission } = usePermissions();

  if (!hasPermission(requiredPermission)) {
    return fallback || (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Lock className="h-12 w-12 mx-auto text-gray-400" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Access Denied</h3>
                <p className="text-sm text-gray-600 mt-1">
                  You don't have permission to access this page. Please contact your administrator.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
