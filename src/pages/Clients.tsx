
import { Users, Shield } from "lucide-react";
import { ClientDashboard } from "@/components/clients/ClientDashboard";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Clients() {
  const navigate = useNavigate();
  
  return (
    <PermissionGate
      permissions={["clients_view"]}
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
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
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-teal-50 rounded-xl shadow-sm">
                  <Users className="h-8 w-8 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Client Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Comprehensive client relationship management
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ClientDashboard />
    </div>
    </PermissionGate>
  );
}
