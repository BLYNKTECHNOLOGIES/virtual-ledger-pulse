
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Scale, Receipt, Shield, Building } from "lucide-react";
import { BankingComplianceTab } from "@/components/compliance/BankingComplianceTab";
import { LegalComplianceTab } from "@/components/compliance/LegalComplianceTab";
import { TaxationComplianceTab } from "@/components/compliance/TaxationComplianceTab";
import { CompanyComplianceTab } from "@/components/compliance/CompanyComplianceTab";
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-xl shadow-sm">
              <Shield className="h-8 w-8 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Compliance Management</h1>
              <p className="text-gray-600 mt-1">Legal, regulatory, and compliance monitoring</p>
            </div>
          </div>
        </div>

      <ErrorBoundary>
        <Tabs defaultValue="banking" className="space-y-6">
          <TabsList className="flex w-full overflow-x-auto gap-1 md:grid md:grid-cols-4">
            <TabsTrigger value="banking" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Banking Compliance</span>
              <span className="sm:hidden">Banking</span>
            </TabsTrigger>
            <TabsTrigger value="legal" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
              <Scale className="h-4 w-4" />
              <span className="hidden sm:inline">Legal Compliance</span>
              <span className="sm:hidden">Legal</span>
            </TabsTrigger>
            <TabsTrigger value="taxation" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Taxation Compliance</span>
              <span className="sm:hidden">Tax</span>
            </TabsTrigger>
            <TabsTrigger value="company" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
              <Building className="h-4 w-4" />
              <span className="hidden sm:inline">Company Compliance</span>
              <span className="sm:hidden">Company</span>
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

          <TabsContent value="company">
            <ErrorBoundary>
              <CompanyComplianceTab />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </ErrorBoundary>
      </div>
    </div>
    </PermissionGate>
  );
}
