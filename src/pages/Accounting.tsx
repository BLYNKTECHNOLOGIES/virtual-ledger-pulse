
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Calculator, Shield } from "lucide-react";
import { SalesPurchasesTab } from "@/components/accounting/SalesPurchasesTab";
import { TaxManagementTab } from "@/components/accounting/TaxManagementTab";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useDeepLinkHighlight } from "@/components/transaction-detail";

export default function Accounting() {
  const navigate = useNavigate();
  useDeepLinkHighlight(['orderId', 'txId']);

  
  return (
    <PermissionGate
      permissions={["accounting_view"]}
      fallback={
        <div className="min-h-screen bg-muted/50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Tax Management.
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
    <div className="p-4 md:p-6 page-mount space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl shadow-sm">
              <Calculator className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Tax Management</h1>
              <p className="text-muted-foreground mt-1">Tax and financial management</p>
            </div>
          </div>
        </div>

      <Tabs defaultValue="sales-purchases" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sales-purchases" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Sales & Purchases
          </TabsTrigger>
          <TabsTrigger value="tax" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Tax Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales-purchases">
          <SalesPurchasesTab />
        </TabsContent>

        <TabsContent value="tax">
          <TaxManagementTab />
        </TabsContent>
      </Tabs>
    </div>
    </PermissionGate>
  );
}
