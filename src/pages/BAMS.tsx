
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BankAccountManagement } from "@/components/bams/BankAccountManagement";
import { PaymentMethodManagement } from "@/components/bams/PaymentMethodManagement";
import { PurchaseManagement } from "@/components/bams/PurchaseManagement";
import { BankJournalEntries } from "@/components/bams/BankJournalEntries";
import { CreditCard, Building, ShoppingBag, BookOpen } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export default function BAMS() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full w-full overflow-auto bg-gray-50 p-4 md:p-6">
        <div className="max-w-full space-y-6">
          <div className="flex items-center justify-start">
            <div className="flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">BAMS</h1>
            </div>
          </div>

          <Card className="shadow-lg">
            <CardContent className="p-4 md:p-6">
              <Tabs defaultValue="bank-accounts" className="space-y-6">
                <div className="w-full overflow-x-auto">
                  <TabsList className="grid w-full grid-cols-4 min-w-[600px] md:min-w-0">
                    <TabsTrigger value="bank-accounts" className="flex items-center gap-2 text-xs md:text-sm">
                      <Building className="h-4 w-4" />
                      <span className="hidden sm:inline">Bank Accounts</span>
                      <span className="sm:hidden">Banks</span>
                    </TabsTrigger>
                    <TabsTrigger value="payment-methods" className="flex items-center gap-2 text-xs md:text-sm">
                      <CreditCard className="h-4 w-4" />
                      <span className="hidden sm:inline">Payment Methods</span>
                      <span className="sm:hidden">Payment</span>
                    </TabsTrigger>
                    <TabsTrigger value="purchases" className="flex items-center gap-2 text-xs md:text-sm">
                      <ShoppingBag className="h-4 w-4" />
                      <span className="hidden sm:inline">Purchase Management</span>
                      <span className="sm:hidden">Purchase</span>
                    </TabsTrigger>
                    <TabsTrigger value="journal-entries" className="flex items-center gap-2 text-xs md:text-sm">
                      <BookOpen className="h-4 w-4" />
                      <span className="hidden sm:inline">Bank Journal Entries</span>
                      <span className="sm:hidden">Journal</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="w-full">
                  <TabsContent value="bank-accounts" className="mt-6">
                    <BankAccountManagement />
                  </TabsContent>

                  <TabsContent value="payment-methods" className="mt-6">
                    <PaymentMethodManagement />
                  </TabsContent>

                  <TabsContent value="purchases" className="mt-6">
                    <PurchaseManagement />
                  </TabsContent>

                  <TabsContent value="journal-entries" className="mt-6">
                    <BankJournalEntries />
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
