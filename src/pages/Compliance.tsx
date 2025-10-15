
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Scale, Receipt, Shield } from "lucide-react";
import { BankingComplianceTab } from "@/components/compliance/BankingComplianceTab";
import { LegalComplianceTab } from "@/components/compliance/LegalComplianceTab";
import { TaxationComplianceTab } from "@/components/compliance/TaxationComplianceTab";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Compliance() {
  const navigate = useNavigate();
  
  return (
    <PermissionGate
      permissions={["compliance_view"]}
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Compliance Management.
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
                <div className="p-3 bg-purple-50 rounded-xl shadow-sm">
                  <Shield className="h-8 w-8 text-purple-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Compliance Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Legal, regulatory, and compliance monitoring
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Compliance</h1>
        <p className="text-gray-600 mt-2">Manage banking, legal, and taxation compliance</p>
      </div>

      <ErrorBoundary>
        <Tabs defaultValue="banking" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="banking" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Banking Compliance
            </TabsTrigger>
            <TabsTrigger value="legal" className="flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Legal Compliance
            </TabsTrigger>
            <TabsTrigger value="taxation" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Taxation Compliance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="banking">
            <ErrorBoundary>
              <BankingComplianceTab />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="legal">
            <ErrorBoundary>
              <LegalComplianceTab />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="taxation">
            <ErrorBoundary>
              <TaxationComplianceTab />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </ErrorBoundary>
      </div>
    </div>
    </PermissionGate>
  );
}
