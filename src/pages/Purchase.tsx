
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Download, ShoppingBag, Filter, Search } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingPurchaseOrders } from "@/components/purchase/PendingPurchaseOrders";
import { ReviewNeededOrders } from "@/components/purchase/ReviewNeededOrders";
import { CompletedPurchaseOrders } from "@/components/purchase/CompletedPurchaseOrders";
import { NewPurchaseOrderDialog } from "@/components/purchase/NewPurchaseOrderDialog";
import { ManualPurchaseEntryDialog } from "@/components/purchase/ManualPurchaseEntryDialog";
import { PermissionGate } from "@/components/PermissionGate";

export default function Purchase() {
  const [showPurchaseOrderDialog, setShowPurchaseOrderDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();

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

  const clearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearchTerm("");
    setShowFilterDialog(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-violet-50 rounded-xl shadow-sm">
                  <ShoppingBag className="h-8 w-8 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Purchase Order Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Manage inventory purchases and supplier orders
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <PermissionGate permissions={["MANAGE_PURCHASE"]} showFallback={false}>
                <ManualPurchaseEntryDialog onSuccess={handleRefreshData} />
                <Button onClick={() => setShowPurchaseOrderDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Purchase Stock
                </Button>
              </PermissionGate>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}

        <Card>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <Input 
                    placeholder="Search by order number, supplier, contact..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
                <Button variant="outline" onClick={() => setShowFilterDialog(true)}>
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Filter Purchase Orders</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date From</Label>
                      <Input 
                        type="date" 
                        value={filterDateFrom ? format(filterDateFrom, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setFilterDateFrom(e.target.value ? new Date(e.target.value) : undefined)}
                      />
                    </div>
                    <div>
                      <Label>Date To</Label>
                      <Input 
                        type="date" 
                        value={filterDateTo ? format(filterDateTo, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setFilterDateTo(e.target.value ? new Date(e.target.value) : undefined)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={clearFilters}>Clear</Button>
                    <Button onClick={() => setShowFilterDialog(false)}>Apply</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
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
              <PendingPurchaseOrders 
                searchTerm={searchTerm}
                dateFrom={filterDateFrom}
                dateTo={filterDateTo}
              />
            </TabsContent>

            <TabsContent value="review">
              <ReviewNeededOrders 
                searchTerm={searchTerm}
                dateFrom={filterDateFrom}
                dateTo={filterDateTo}
              />
            </TabsContent>

            <TabsContent value="completed">
              <CompletedPurchaseOrders 
                searchTerm={searchTerm}
                dateFrom={filterDateFrom}
                dateTo={filterDateTo}
              />
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
