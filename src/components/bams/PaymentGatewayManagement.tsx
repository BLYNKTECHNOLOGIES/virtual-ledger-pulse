import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvailablePaymentGateways } from "./payment-gateway/AvailablePaymentGateways";
import { PendingSettlements } from "./payment-gateway/PendingSettlements";
import { CreditCard, Clock } from "lucide-react";

export function PaymentGatewayManagement() {
  return (
    <div className="w-full h-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Payment Gateway Management</h2>
      </div>

      <Tabs defaultValue="available-gateways" className="h-full flex flex-col">
        <TabsList className="grid grid-cols-2 w-full max-w-md bg-gray-100 p-1 rounded-md mb-6">
          <TabsTrigger value="available-gateways" className="flex items-center gap-2 text-sm p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <CreditCard className="h-4 w-4" />
            Available Gateways
          </TabsTrigger>
          <TabsTrigger value="pending-settlements" className="flex items-center gap-2 text-sm p-3 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="h-4 w-4" />
            Pending Settlements
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 w-full overflow-auto">
          <TabsContent value="available-gateways" className="w-full h-full">
            <AvailablePaymentGateways />
          </TabsContent>
          <TabsContent value="pending-settlements" className="w-full h-full">
            <PendingSettlements />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}