
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-start">
          <div className="flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">BAMS</h1>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardContent className="p-6">
            <Tabs defaultValue="bank-accounts" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="bank-accounts" className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Bank Accounts
                </TabsTrigger>
                <TabsTrigger value="payment-methods" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Methods
                </TabsTrigger>
                <TabsTrigger value="purchases" className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Purchase Management
                </TabsTrigger>
                <TabsTrigger value="journal-entries" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Bank Journal Entries
                </TabsTrigger>
              </TabsList>

              <TabsContent value="bank-accounts">
                <BankAccountManagement />
              </TabsContent>

              <TabsContent value="payment-methods">
                <PaymentMethodManagement />
              </TabsContent>

              <TabsContent value="purchases">
                <PurchaseManagement />
              </TabsContent>

              <TabsContent value="journal-entries">
                <BankJournalEntries />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
