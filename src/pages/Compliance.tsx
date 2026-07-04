import { Card, CardContent } from "@/components/ui/card";
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
        <div className="min-h-screen bg-background p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Compliance Management.
                  </p>
                </div>
                <Button onClick={() => navigate("/dashboard")}>Return to Dashboard</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <div className="min-h-screen bg-background page-mount">
        {/* Executive Header */}
        <div className="border-b border-border bg-card">
          <div className="px-6 md:px-10 py-8 max-w-[1600px] mx-auto">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-md border border-border bg-muted/40 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-foreground" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                    Governance · Risk · Compliance
                  </p>
                  <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight mt-1">
                    Compliance Management
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Centralized oversight for legal, regulatory, and statutory obligations
                  </p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-6 text-right">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Jurisdiction</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">India · RBI / FIU-IND</p>
                </div>
                <div className="h-10 w-px bg-border" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Reporting Cycle</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">FY 2025-26</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 md:px-10 py-8 max-w-[1600px] mx-auto">
          <ErrorBoundary>
            <Tabs defaultValue="banking" className="space-y-6">
              <TabsList className="h-auto w-full justify-start gap-1 bg-transparent border-b border-border rounded-none p-0">
                <TabsTrigger
                  value="banking"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground px-4 py-3 text-sm font-medium gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  Banking
                </TabsTrigger>
                <TabsTrigger
                  value="legal"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground px-4 py-3 text-sm font-medium gap-2"
                >
                  <Scale className="h-4 w-4" />
                  Legal
                </TabsTrigger>
                <TabsTrigger
                  value="taxation"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground px-4 py-3 text-sm font-medium gap-2"
                >
                  <Receipt className="h-4 w-4" />
                  Taxation
                </TabsTrigger>
                <TabsTrigger
                  value="company"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground px-4 py-3 text-sm font-medium gap-2"
                >
                  <Building className="h-4 w-4" />
                  Company
                </TabsTrigger>
              </TabsList>

              <TabsContent value="banking" className="mt-6">
                <ErrorBoundary><BankingComplianceTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="legal" className="mt-6">
                <ErrorBoundary><LegalComplianceTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="taxation" className="mt-6">
                <ErrorBoundary><TaxationComplianceTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="company" className="mt-6">
                <ErrorBoundary><CompanyComplianceTab /></ErrorBoundary>
              </TabsContent>
            </Tabs>
          </ErrorBoundary>
        </div>
      </div>
    </PermissionGate>
  );
}
