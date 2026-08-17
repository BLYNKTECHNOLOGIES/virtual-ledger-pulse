import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Scale, Shield, Building, LayoutDashboard, Gavel, History } from "lucide-react";
import { BankingComplianceTab } from "@/components/compliance/BankingComplianceTab";
import { LegalComplianceTab } from "@/components/compliance/LegalComplianceTab";
import { CompanyComplianceTab } from "@/components/compliance/CompanyComplianceTab";
import { ComplianceCommandCentre } from "@/components/compliance/ComplianceCommandCentre";
import { ComplianceGovernanceTab } from "@/components/compliance/ComplianceGovernanceTab";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  complianceTabsListCls,
  complianceTabTriggerCls,
  complianceTabsWrapperCls,
} from "@/components/compliance/complianceTabStyles";

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
          <div className="px-6 md:px-10 py-5 max-w-[1600px] mx-auto">
            <PageHeader
              title={
                <span className="flex items-center gap-4">
                  <span className="h-12 w-12 rounded-md border border-border bg-muted/40 flex items-center justify-center">
                    <Shield className="h-6 w-6 text-foreground" strokeWidth={1.5} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                      Governance · Risk · Compliance
                    </span>
                    <span>Compliance Management</span>
                  </span>
                </span>
              }
              description="Centralized oversight for legal, regulatory, and statutory obligations"
              actions={
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
              }
            />

          </div>
        </div>

        <div className="px-6 md:px-10 py-5 max-w-[1600px] mx-auto">
          <ErrorBoundary>
            <Tabs defaultValue="overview" className="space-y-5">
              <div className={complianceTabsWrapperCls}>
                <TabsList className={complianceTabsListCls}>
                  <TabsTrigger value="overview" className={complianceTabTriggerCls}>
                    <LayoutDashboard className="h-4 w-4" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="banking" className={complianceTabTriggerCls}>
                    <Building2 className="h-4 w-4" />
                    Banking
                  </TabsTrigger>
                  <TabsTrigger value="legal" className={complianceTabTriggerCls}>
                    <Scale className="h-4 w-4" />
                    Legal
                  </TabsTrigger>
                  <TabsTrigger value="company" className={complianceTabTriggerCls}>
                    <Building className="h-4 w-4" />
                    Company
                  </TabsTrigger>
                  <TabsTrigger value="governance" className={complianceTabTriggerCls}>
                    <History className="h-4 w-4" />
                    Governance
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="mt-5">
                <ErrorBoundary><ComplianceCommandCentre /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="banking" className="mt-5">
                <ErrorBoundary><BankingComplianceTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="legal" className="mt-5">
                <ErrorBoundary><LegalComplianceTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="company" className="mt-5">
                <ErrorBoundary><CompanyComplianceTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="governance" className="mt-5">
                <ErrorBoundary><ComplianceGovernanceTab /></ErrorBoundary>
              </TabsContent>
            </Tabs>
          </ErrorBoundary>
        </div>
      </div>
    </PermissionGate>
  );
}
