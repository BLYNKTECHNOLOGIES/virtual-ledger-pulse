
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingPurchaseOrders } from "@/components/purchase/PendingPurchaseOrders";
import { CompletedPurchaseOrders } from "@/components/purchase/CompletedPurchaseOrders";
import { ReviewNeededOrders } from "@/components/purchase/ReviewNeededOrders";
import { PayerManagement } from "@/components/purchase/PayerManagement";
import { ShoppingCart, Clock, CheckCircle, AlertTriangle, Users } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export default function Purchase() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full w-full overflow-auto bg-gray-50 p-4 md:p-6">
        <div className="max-w-full space-y-6">
          <div className="flex items-center justify-start">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-purple-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Purchase Management</h1>
            </div>
          </div>

          <Card className="shadow-lg">
            <CardContent className="p-4 md:p-6">
              <Tabs defaultValue="pending" className="space-y-6">
                <div className="w-full overflow-x-auto">
                  <TabsList className="grid w-full grid-cols-5 min-w-[700px] md:min-w-0">
                    <TabsTrigger value="pending" className="flex items-center gap-2 text-xs md:text-sm">
                      <Clock className="h-4 w-4" />
                      <span className="hidden sm:inline">Pending Orders</span>
                      <span className="sm:hidden">Pending</span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="flex items-center gap-2 text-xs md:text-sm">
                      <CheckCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">Completed</span>
                      <span className="sm:hidden">Done</span>
                    </TabsTrigger>
                    <TabsTrigger value="review" className="flex items-center gap-2 text-xs md:text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="hidden sm:inline">Review Needed</span>
                      <span className="sm:hidden">Review</span>
                    </TabsTrigger>
                    <TabsTrigger value="payers" className="flex items-center gap-2 text-xs md:text-sm">
                      <Users className="h-4 w-4" />
                      <span className="hidden sm:inline">Payer Management</span>
                      <span className="sm:hidden">Payers</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="w-full">
                  <TabsContent value="pending" className="mt-6">
                    <PendingPurchaseOrders />
                  </TabsContent>

                  <TabsContent value="completed" className="mt-6">
                    <CompletedPurchaseOrders />
                  </TabsContent>

                  <TabsContent value="review" className="mt-6">
                    <ReviewNeededOrders />
                  </TabsContent>

                  <TabsContent value="payers" className="mt-6">
                    <PayerManagement />
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
