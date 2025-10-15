
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccountManagement } from "@/components/bams/BankAccountManagement";
import { PaymentMethodManagement } from "@/components/bams/PaymentMethodManagement";
import { PurchaseManagement } from "@/components/bams/PurchaseManagement";
import { BankJournalEntries } from "@/components/bams/BankJournalEntries";
import { PaymentGatewayManagement } from "@/components/bams/PaymentGatewayManagement";
import { CreditCard, Building, ShoppingBag, BookOpen, Smartphone, AlertCircle, BarChart3 } from "lucide-react";
import { CaseGenerator } from "@/components/bams/CaseGenerator";
import { AccountSummary } from "@/components/bams/AccountSummary";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BAMS() {
  const navigate = useNavigate();
  
  return (
    <PermissionGate 
      permissions={["bams_view", "bams_manage"]} 
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <Card className="max-w-md border-red-200 bg-red-50">
            <CardContent className="p-8 text-center">
              <div className="space-y-4">
                <div className="text-red-500">
                  <Shield className="h-12 w-12 mx-auto mb-3" />
                  <h3 className="text-xl font-semibold">Access Denied</h3>
                  <p className="text-sm text-red-600 mt-2">
                    You don't have permission to access the Banking & Payment Management module.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
                >
                  Return to Dashboard
                </button>
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
                  <div className="p-3 bg-rose-50 rounded-xl shadow-sm">
                    <CreditCard className="h-8 w-8 text-rose-600" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                      BAMS - Banking & Payment Management
                    </h1>
                    <p className="text-slate-600 text-lg">
                      Comprehensive banking and payment system management
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full h-full flex-1 overflow-auto bg-white rounded-lg shadow-sm p-0">
          <Tabs defaultValue="bank-accounts" className="h-full flex flex-col">
            <TabsList className="grid grid-cols-2 md:grid-cols-7 w-full bg-gray-100 p-1 rounded-md mb-6">
              <TabsTrigger value="account-summary" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Account Summary</span>
                <span className="sm:hidden">Summary</span>
              </TabsTrigger>
              <TabsTrigger value="bank-accounts" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Building className="h-4 w-4" />
                <span className="hidden sm:inline">Bank Accounts</span>
                <span className="sm:hidden">Banks</span>
              </TabsTrigger>
              <TabsTrigger value="payment-methods" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Sales Methods</span>
                <span className="sm:hidden">Sales</span>
              </TabsTrigger>
              <TabsTrigger value="purchases" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Purchase Management</span>
                <span className="sm:hidden">Purchases</span>
              </TabsTrigger>
              <TabsTrigger value="journal-entries" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Bank Journal Entries</span>
                <span className="sm:hidden">Journal</span>
              </TabsTrigger>
              <TabsTrigger value="payment-gateway" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Smartphone className="h-4 w-4" />
                <span className="hidden sm:inline">Payment Gateway</span>
                <span className="sm:hidden">Gateway</span>
              </TabsTrigger>
              <TabsTrigger value="case-generator" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <AlertCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Case Generator</span>
                <span className="sm:hidden">Cases</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 w-full overflow-auto">
              <TabsContent value="account-summary" className="w-full h-full">
                <AccountSummary />
              </TabsContent>
              <TabsContent value="bank-accounts" className="w-full h-full">
                <BankAccountManagement />
              </TabsContent>
              <TabsContent value="payment-methods" className="w-full h-full">
                <PaymentMethodManagement />
              </TabsContent>
              <TabsContent value="purchases" className="w-full h-full">
                <PurchaseManagement />
              </TabsContent>
              <TabsContent value="journal-entries" className="w-full h-full">
                <BankJournalEntries />
              </TabsContent>
              <TabsContent value="payment-gateway" className="w-full h-full">
                <PaymentGatewayManagement />
              </TabsContent>
              <TabsContent value="case-generator" className="w-full h-full">
                <CaseGenerator />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </PermissionGate>
  );
}
