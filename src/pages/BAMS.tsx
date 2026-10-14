
import { useState, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Building, ShoppingBag, BookOpen, Smartphone, AlertCircle, BarChart3, Users } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDeepLinkHighlight } from "@/components/transaction-detail";
import { usePermissions } from "@/hooks/usePermissions";

const BankAccountManagement = lazy(() => import("@/components/bams/BankAccountManagement").then(m => ({ default: m.BankAccountManagement })));
const PaymentMethodManagement = lazy(() => import("@/components/bams/PaymentMethodManagement").then(m => ({ default: m.PaymentMethodManagement })));
const PurchaseManagement = lazy(() => import("@/components/bams/PurchaseManagement").then(m => ({ default: m.PurchaseManagement })));
const BankJournalEntries = lazy(() => import("@/components/bams/BankJournalEntries").then(m => ({ default: m.BankJournalEntries })));
const PaymentGatewayManagement = lazy(() => import("@/components/bams/PaymentGatewayManagement").then(m => ({ default: m.PaymentGatewayManagement })));
const CaseGenerator = lazy(() => import("@/components/bams/CaseGenerator").then(m => ({ default: m.CaseGenerator })));
const AccountSummary = lazy(() => import("@/components/bams/AccountSummary").then(m => ({ default: m.AccountSummary })));
const BeneficiaryManagement = lazy(() => import("@/components/bams/BeneficiaryManagement").then(m => ({ default: m.BeneficiaryManagement })));

const TabFallback = () => <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

export default function BAMS() {
  const navigate = useNavigate();
  useDeepLinkHighlight(['txId']);
  const { hasAnyPermission } = usePermissions();
  const canFullBams = hasAnyPermission(["bams_view", "bams_manage"]);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "journal" ? "journal-entries" : (canFullBams ? "bank-accounts" : "journal-entries");

  return (
    <PermissionGate 
      permissions={["bams_view", "bams_manage", "bams_journal_entry"]} 
      fallback={
        <div className="min-h-screen bg-muted/50 p-6 flex items-center justify-center">
          <Card className="max-w-md border-destructive/20 bg-destructive/10">
            <CardContent className="p-8 text-center">
              <div className="space-y-4">
                <div className="text-destructive">
                  <Shield className="h-12 w-12 mx-auto mb-3" />
                  <h3 className="text-xl font-semibold">Access Denied</h3>
                  <p className="text-sm text-destructive mt-2">
                    You don't have permission to access the Banking & Payment Management module.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-4 px-4 py-2 bg-destructive text-primary-foreground rounded-md hover:bg-destructive transition"
                >
                  Return to Dashboard
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <div className="min-h-screen bg-muted/50 p-6 page-mount">
        {/* Header */}
        <div className="bg-card rounded-xl mb-6 shadow-sm border border-border">
          <div className="px-6 py-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <PageHeader
                  title={
                    <span className="flex items-center gap-3 text-muted-foreground">
                      <span className="p-3 bg-destructive/10 rounded-xl shadow-sm">
                        <CreditCard className="h-8 w-8 text-destructive" />
                      </span>
                      BAMS - Banking & Payment Management
                    </span>
                  }
                  description="Comprehensive banking and payment system management"
                />
              </div>

            </div>
          </div>
        </div>

        <div className="w-full h-full flex-1 overflow-auto bg-card rounded-lg shadow-sm p-0">
          <Tabs defaultValue={initialTab} className="h-full flex flex-col">
            {/* Single responsive tab bar: horizontal scroll on mobile, full width on desktop */}
            <div className="overflow-x-auto pb-1 mb-4 md:mb-6">
              <TabsList className="flex w-full flex-wrap bg-muted p-1 rounded-md gap-1">
                {canFullBams && (
                  <TabsTrigger value="account-summary" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <BarChart3 className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                    <span>Account Summary</span>
                  </TabsTrigger>
                )}
                {canFullBams && (
                  <TabsTrigger value="bank-accounts" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <Building className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                    <span>Bank Accounts</span>
                  </TabsTrigger>
                )}
                {canFullBams && (
                  <TabsTrigger value="payment-methods" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <CreditCard className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                    <span>Sales Methods</span>
                  </TabsTrigger>
                )}
                {canFullBams && (
                  <TabsTrigger value="purchases" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <ShoppingBag className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                    <span>Purchase Management</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="journal-entries" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  <BookOpen className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                  <span>Bank Journal Entries</span>
                </TabsTrigger>
                {canFullBams && (
                  <TabsTrigger value="payment-gateway" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <Smartphone className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                    <span>Payment Gateway</span>
                  </TabsTrigger>
                )}
                {canFullBams && (
                  <TabsTrigger value="case-generator" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <AlertCircle className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                    <span>Case Generator</span>
                  </TabsTrigger>
                )}
                {canFullBams && (
                  <TabsTrigger value="beneficiary" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 py-2 md:p-3 rounded-md whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <Users className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                    <span>Beneficiary</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="flex-1 w-full overflow-auto">
              {canFullBams && (
                <TabsContent value="account-summary" className="w-full h-full"><Suspense fallback={<TabFallback />}><AccountSummary /></Suspense></TabsContent>
              )}
              {canFullBams && (
                <TabsContent value="bank-accounts" className="w-full h-full"><Suspense fallback={<TabFallback />}><BankAccountManagement /></Suspense></TabsContent>
              )}
              {canFullBams && (
                <TabsContent value="payment-methods" className="w-full h-full"><Suspense fallback={<TabFallback />}><PaymentMethodManagement /></Suspense></TabsContent>
              )}
              {canFullBams && (
                <TabsContent value="purchases" className="w-full h-full"><Suspense fallback={<TabFallback />}><PurchaseManagement /></Suspense></TabsContent>
              )}
              <TabsContent value="journal-entries" className="w-full h-full"><Suspense fallback={<TabFallback />}><BankJournalEntries /></Suspense></TabsContent>
              {canFullBams && (
                <TabsContent value="payment-gateway" className="w-full h-full"><Suspense fallback={<TabFallback />}><PaymentGatewayManagement /></Suspense></TabsContent>
              )}
              {canFullBams && (
                <TabsContent value="case-generator" className="w-full h-full"><Suspense fallback={<TabFallback />}><CaseGenerator /></Suspense></TabsContent>
              )}
              {canFullBams && (
                <TabsContent value="beneficiary" className="w-full h-full"><Suspense fallback={<TabFallback />}><BeneficiaryManagement /></Suspense></TabsContent>
              )}
            </div>
          </Tabs>
        </div>
      </div>
    </PermissionGate>
  );
}
