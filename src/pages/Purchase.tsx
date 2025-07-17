
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Download } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingPurchaseOrders } from "@/components/purchase/PendingPurchaseOrders";
import { ReviewNeededOrders } from "@/components/purchase/ReviewNeededOrders";
import { CompletedPurchaseOrders } from "@/components/purchase/CompletedPurchaseOrders";
import { NewPurchaseOrderDialog } from "@/components/purchase/NewPurchaseOrderDialog";
import { ManualPurchaseEntryDialog } from "@/components/purchase/ManualPurchaseEntryDialog";

export default function Purchase() {
  const [showPurchaseOrderDialog, setShowPurchaseOrderDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  const handleRefreshData = () => {
    // This will trigger a refetch of the summary data
    window.location.reload();
  };

  // Fetch purchase orders summary for badges
  const { data: ordersSummary } = useQuery({
    queryKey: ['purchase_orders_summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('status');
      
      if (error) throw error;
      
      const pending = data?.filter(order => order.status === 'PENDING').length || 0;
      const review = data?.filter(order => order.status === 'REVIEW_NEEDED').length || 0;
      const completed = data?.filter(order => order.status === 'COMPLETED').length || 0;
      
      return { pending, review, completed };
    },
  });

  const handleExportCSV = () => {
    // CSV export logic will be implemented in individual tab components
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🛒 Purchase Order Management</h1>
          <p className="text-gray-600 mt-1">Manage inventory purchases and supplier orders</p>
        </div>
        <div className="flex gap-2">
          <ManualPurchaseEntryDialog onSuccess={handleRefreshData} />
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => setShowPurchaseOrderDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Purchase Order
          </Button>
        </div>
      </div>

      {/* Purchase Orders Tabs */}
      <Card className="w-full">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                Pending Purchase Orders
                {ordersSummary?.pending > 0 && (
                  <Badge variant="secondary">{ordersSummary.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="review" className="flex items-center gap-2">
                Review Needed
                {ordersSummary?.review > 0 && (
                  <Badge variant="destructive">{ordersSummary.review}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-2">
                Completed Orders
                {ordersSummary?.completed > 0 && (
                  <Badge variant="default">{ordersSummary.completed}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <PendingPurchaseOrders />
            </TabsContent>

            <TabsContent value="review">
              <ReviewNeededOrders />
            </TabsContent>

            <TabsContent value="completed">
              <CompletedPurchaseOrders />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* New Purchase Order Dialog */}
      <NewPurchaseOrderDialog 
        open={showPurchaseOrderDialog} 
        onOpenChange={setShowPurchaseOrderDialog}
      />
    </div>
  );
}
