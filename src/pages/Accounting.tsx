
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, FileText, CreditCard, TrendingUp, Calculator, BarChart } from "lucide-react";
import { LedgerAccountsTab } from "@/components/accounting/LedgerAccountsTab";
import { JournalEntriesTab } from "@/components/accounting/JournalEntriesTab";
import { BankReconciliationTab } from "@/components/accounting/BankReconciliationTab";
import { SalesPurchasesTab } from "@/components/accounting/SalesPurchasesTab";
import { TaxManagementTab } from "@/components/accounting/TaxManagementTab";
import { ReportsTab } from "@/components/accounting/ReportsTab";

export default function Accounting() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-200 via-emerald-300 to-teal-300 text-slate-800 rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-emerald-100 rounded-xl shadow-lg">
                  <Calculator className="h-8 w-8 text-emerald-700" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Accounting Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Comprehensive accounting and financial records
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Accounting Management System</h1>
        <p className="text-gray-600 mt-2">Complete financial management and reporting</p>
      </div>

      <Tabs defaultValue="ledger" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="ledger" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Ledger Accounts
          </TabsTrigger>
          <TabsTrigger value="journal" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Journal Entries
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Bank Reconciliation
          </TabsTrigger>
          <TabsTrigger value="sales-purchases" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Sales & Purchases
          </TabsTrigger>
          <TabsTrigger value="tax" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Tax Management
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <BarChart className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <LedgerAccountsTab />
        </TabsContent>

        <TabsContent value="journal">
          <JournalEntriesTab />
        </TabsContent>

        <TabsContent value="reconciliation">
          <BankReconciliationTab />
        </TabsContent>

        <TabsContent value="sales-purchases">
          <SalesPurchasesTab />
        </TabsContent>

        <TabsContent value="tax">
          <TaxManagementTab />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
