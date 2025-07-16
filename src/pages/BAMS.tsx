
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccountManagement } from "@/components/bams/BankAccountManagement";
import { PaymentMethodManagement } from "@/components/bams/PaymentMethodManagement";
import { PurchaseManagement } from "@/components/bams/PurchaseManagement";
import { BankJournalEntries } from "@/components/bams/BankJournalEntries";
import { CreditCard, Building, ShoppingBag, BookOpen } from "lucide-react";

export default function BAMS() {
  return (
    <div className="w-full h-full space-y-6 px-0">
      <div className="flex items-center justify-start px-4">
        <div className="flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900">BAMS</h1>
        </div>
      </div>

      <div className="w-full h-full flex-1 overflow-auto bg-white rounded-lg shadow-sm p-0">
        <Tabs defaultValue="bank-accounts" className="h-full flex flex-col">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full bg-gray-100 p-1 rounded-md mb-6">
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
          </TabsList>

          <div className="flex-1 w-full overflow-auto">
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
          </div>
        </Tabs>
      </div>
    </div>
  );
}
