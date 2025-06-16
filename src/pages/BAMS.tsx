
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BankAccountManagement } from "@/components/bams/BankAccountManagement";
import { PaymentMethodManagement } from "@/components/bams/PaymentMethodManagement";
import { PurchaseManagement } from "@/components/bams/PurchaseManagement";
import { PurchasePaymentMethodsList } from "@/components/purchase/PurchasePaymentMethodsList";
import { CreditCard, Building, ShoppingBag, List } from "lucide-react";

export default function BAMS() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">BAMS</h1>
          <p className="text-gray-600">Bank Account and Payment Method Management System</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Tabs defaultValue="bank-accounts" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="bank-accounts" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Bank Accounts (Sales)
              </TabsTrigger>
              <TabsTrigger value="payment-methods" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Methods (Sales)
              </TabsTrigger>
              <TabsTrigger value="purchases" className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Purchase Management
              </TabsTrigger>
              <TabsTrigger value="purchase-methods-list" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                Purchase Methods List
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

            <TabsContent value="purchase-methods-list">
              <PurchasePaymentMethodsList />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
