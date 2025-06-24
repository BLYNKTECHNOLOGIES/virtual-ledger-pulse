
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BankAccountManagement } from "@/components/bams/BankAccountManagement";
import { PaymentMethodManagement } from "@/components/bams/PaymentMethodManagement";
import { PurchaseManagement } from "@/components/bams/PurchaseManagement";
import { BankJournalEntries } from "@/components/bams/BankJournalEntries";
import { CreditCard, Building, ShoppingBag, BookOpen } from "lucide-react";

export default function BAMS() {
  return (
    <div className="h-full w-full">
      <div className="h-full w-full p-4 sm:p-6">
        <div className="h-full w-full space-y-4 sm:space-y-6">
          <div className="flex items-center justify-start">
            <div className="flex items-center gap-3">
              <CreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">BAMS</h1>
            </div>
          </div>

          <div className="h-[calc(100%-60px)] sm:h-[calc(100%-80px)]">
            <Card className="shadow-lg h-full">
              <CardContent className="p-4 sm:p-6 h-full">
                <Tabs defaultValue="bank-accounts" className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-4 sm:mb-6 h-auto">
                    <TabsTrigger value="bank-accounts" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
                      <Building className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Bank Accounts</span>
                      <span className="sm:hidden">Accounts</span>
                    </TabsTrigger>
                    <TabsTrigger value="payment-methods" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
                      <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Payment Methods</span>
                      <span className="sm:hidden">Payments</span>
                    </TabsTrigger>
                    <TabsTrigger value="purchases" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
                      <ShoppingBag className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Purchase Management</span>
                      <span className="sm:hidden">Purchases</span>
                    </TabsTrigger>
                    <TabsTrigger value="journal-entries" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm p-2 sm:p-3">
                      <BookOpen className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Bank Journal Entries</span>
                      <span className="sm:hidden">Journal</span>
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-auto">
                    <TabsContent value="bank-accounts" className="h-full mt-0">
                      <BankAccountManagement />
                    </TabsContent>

                    <TabsContent value="payment-methods" className="h-full mt-0">
                      <PaymentMethodManagement />
                    </TabsContent>

                    <TabsContent value="purchases" className="h-full mt-0">
                      <PurchaseManagement />
                    </TabsContent>

                    <TabsContent value="journal-entries" className="h-full mt-0">
                      <BankJournalEntries />
                    </TabsContent>
                  </div>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
