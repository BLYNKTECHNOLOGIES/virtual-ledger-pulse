
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
    <div className="w-full h-full space-y-6">
      <div className="flex items-center justify-start">
        <div className="flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-blue-600" />
          <h1 className="text-4xl font-bold text-gray-900">BAMS</h1>
        </div>
      </div>

      <Card className="shadow-lg h-[calc(100vh-200px)]">
        <CardContent className="p-6 h-full">
          <Tabs defaultValue="bank-accounts" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4 mb-6 h-auto">
              <TabsTrigger value="bank-accounts" className="flex items-center gap-2 text-sm p-3">
                <Building className="h-4 w-4" />
                <span>Bank Accounts</span>
              </TabsTrigger>
              <TabsTrigger value="payment-methods" className="flex items-center gap-2 text-sm p-3">
                <CreditCard className="h-4 w-4" />
                <span>Payment Methods</span>
              </TabsTrigger>
              <TabsTrigger value="purchases" className="flex items-center gap-2 text-sm p-3">
                <ShoppingBag className="h-4 w-4" />
                <span>Purchase Management</span>
              </TabsTrigger>
              <TabsTrigger value="journal-entries" className="flex items-center gap-2 text-sm p-3">
                <BookOpen className="h-4 w-4" />
                <span>Bank Journal Entries</span>
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
  );
}
