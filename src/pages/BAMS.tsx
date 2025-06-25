
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccountManagement } from "@/components/bams/BankAccountManagement";
import { PaymentMethodManagement } from "@/components/bams/PaymentMethodManagement";
import { PurchaseManagement } from "@/components/bams/PurchaseManagement";
import { BankJournalEntries } from "@/components/bams/BankJournalEntries";
import { CreditCard, Building, ShoppingBag, BookOpen } from "lucide-react";

export default function BAMS() {
  return (
    <div className="w-full h-full px-4 sm:px-6 lg:px-8 py-4 space-y-6">
      <div className="flex items-center justify-start">
        <div className="flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900">BAMS</h1>
        </div>
      </div>

      <div className="w-full h-[calc(100vh-200px)] flex flex-col">
        <Tabs defaultValue="bank-accounts" className="flex-1 flex flex-col w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6 h-auto bg-gray-50 rounded-lg p-1">
            <TabsTrigger value="bank-accounts" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Building className="h-4 w-4" />
              <span className="hidden sm:inline">Bank Accounts</span>
              <span className="sm:hidden">Banks</span>
            </TabsTrigger>
            <TabsTrigger value="payment-methods" className="flex items-center gap-2 text-xs sm:text-sm p-2 sm:p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Payment Methods</span>
              <span className="sm:hidden">Payments</span>
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

          <div className="flex-1 overflow-auto w-full">
            <TabsContent value="bank-accounts" className="h-full mt-0 w-full">
              <BankAccountManagement />
            </TabsContent>
            <TabsContent value="payment-methods" className="h-full mt-0 w-full">
              <PaymentMethodManagement />
            </TabsContent>
            <TabsContent value="purchases" className="h-full mt-0 w-full">
              <PurchaseManagement />
            </TabsContent>
            <TabsContent value="journal-entries" className="h-full mt-0 w-full">
              <BankJournalEntries />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
