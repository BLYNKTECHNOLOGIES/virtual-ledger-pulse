
import { BarChart3, Shield } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatisticsTab } from "@/components/hrms/StatisticsTab";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Statistics() {
  const navigate = useNavigate();
  
  return (
    <PermissionGate
      permissions={["statistics_view"]}
      fallback={
        <div className="min-h-screen bg-muted/50 p-6 flex items-center justify-center page-mount">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Statistics & Analytics.
                  </p>
                </div>
                <Button onClick={() => navigate("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
    <div className="p-4 md:p-6">
        {/* Header (single source of truth — StatisticsTab never renders its own;
            it hands its date filter and export controls to this header) */}
        <StatisticsTab
          renderHeader={(actions) => (
            <PageHeader
              title={
                <span className="flex items-center gap-2.5">
                  <span className="p-2 bg-muted rounded-md border border-border">
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  </span>
                  Statistics &amp; Analytics
                </span>
              }
              description="Volume, clients, onboarding, desk activity and costs for the selected period"
              actions={actions}
            />
          )}
        />
    </div>
    </PermissionGate>
  );
}
