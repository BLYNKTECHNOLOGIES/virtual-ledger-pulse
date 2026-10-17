
import { Users, Shield } from "lucide-react";
import { ClientDashboard } from "@/components/clients/ClientDashboard";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import "@/components/clients/client-mobile.css";

export default function Clients() {
  const navigate = useNavigate();
  
  return (
    <PermissionGate
      permissions={["clients_view", "clients_manage", "kyc_approvals_view", "kyc_approvals_manage"]}
      fallback={
        <div className="min-h-screen bg-muted/50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Client Management.
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
    <div className="client-management-page min-w-0 min-h-screen bg-muted/50 p-3 sm:p-6 page-mount">
      {/* Header */}
      <div className="bg-card rounded-xl mb-6 shadow-sm border border-border">
        <div className="px-4 py-4 sm:px-6 sm:py-6">
          <PageHeader
            title={
              <span className="flex items-center gap-2 sm:gap-3">
                <span className="shrink-0 p-2 sm:p-3 bg-primary/10 rounded-lg">
                  <Users className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
                </span>
                <span className="min-w-0 text-xl sm:text-2xl">Client Management</span>
              </span>
            }
            description="Comprehensive client relationship management"
          />
        </div>
      </div>


      <ClientDashboard />
    </div>
    </PermissionGate>
  );
}
