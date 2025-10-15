import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, CheckCircle, XCircle, Users } from "lucide-react";
import { FlaggedClientsTab } from "@/components/risk-management/FlaggedClientsTab";
import { UnderReKYCTab } from "@/components/risk-management/UnderReKYCTab";
import { ClearedClientsTab } from "@/components/risk-management/ClearedClientsTab";
import { BlacklistedClientsTab } from "@/components/risk-management/BlacklistedClientsTab";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/PermissionGate";
import { useNavigate } from "react-router-dom";

export default function RiskManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("flagged");

  // Fetch risk summary statistics
  const { data: riskStats } = useQuery({
    queryKey: ["risk-stats"],
    queryFn: async () => {
      const { data: flagged } = await supabase
        .from("risk_flags")
        .select("id")
        .eq("status", "FLAGGED");

      const { data: underRekyc } = await supabase
        .from("risk_flags")
        .select("id")
        .eq("status", "UNDER_REKYC");

      const { data: cleared } = await supabase
        .from("risk_flags")
        .select("id")
        .eq("status", "CLEARED");

      const { data: blacklisted } = await supabase
        .from("risk_flags")
        .select("id")
        .eq("status", "BLACKLISTED");

      return {
        flagged: flagged?.length || 0,
        underRekyc: underRekyc?.length || 0,
        cleared: cleared?.length || 0,
        blacklisted: blacklisted?.length || 0,
      };
    },
  });

  const runRiskDetection = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("risk-detection");
      
      if (error) throw error;
      
      // Refresh the page after detection
      window.location.reload();
    } catch (error) {
      console.error("Error running risk detection:", error);
    }
  };

  return (
    <PermissionGate
      permissions={["VIEW_RISK_MANAGEMENT"]}
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Risk Management.
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
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Risk Management</h2>
          <p className="text-muted-foreground">
            Monitor and manage user risk assessments and ReKYC processes
          </p>
        </div>
        <Button onClick={runRiskDetection} className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Run Risk Detection
        </Button>
      </div>

      {/* Risk Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Clients</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{riskStats?.flagged || 0}</div>
            <p className="text-xs text-muted-foreground">
              Requires review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Under ReKYC</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{riskStats?.underRekyc || 0}</div>
            <p className="text-xs text-muted-foreground">
              In verification process
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cleared</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{riskStats?.cleared || 0}</div>
            <p className="text-xs text-muted-foreground">
              Risk cleared
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Blacklisted</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{riskStats?.blacklisted || 0}</div>
            <p className="text-xs text-muted-foreground">
              Access restricted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="flagged" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Flagged Clients
            {riskStats?.flagged ? (
              <Badge variant="secondary">{riskStats.flagged}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="under-rekyc" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Under ReKYC
            {riskStats?.underRekyc ? (
              <Badge variant="secondary">{riskStats.underRekyc}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="cleared" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Cleared
            {riskStats?.cleared ? (
              <Badge variant="secondary">{riskStats.cleared}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="blacklisted" className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Blacklisted
            {riskStats?.blacklisted ? (
              <Badge variant="secondary">{riskStats.blacklisted}</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flagged" className="space-y-4">
          <FlaggedClientsTab />
        </TabsContent>

        <TabsContent value="under-rekyc" className="space-y-4">
          <UnderReKYCTab />
        </TabsContent>

        <TabsContent value="cleared" className="space-y-4">
          <ClearedClientsTab />
        </TabsContent>

        <TabsContent value="blacklisted" className="space-y-4">
          <BlacklistedClientsTab />
        </TabsContent>
      </Tabs>
    </div>
    </PermissionGate>
  );
}