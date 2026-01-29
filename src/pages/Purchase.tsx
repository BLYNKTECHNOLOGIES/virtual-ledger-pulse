
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
import { Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Purchase() {
  const navigate = useNavigate();
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
    <PermissionGate
      permissions={["purchase_view"]}
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Purchase Management.
                  </p>
                </div>
                <Button onClick={() => navigate("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
    <div className="min-h-screen bg-gray-50 p-3 md:p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-4 md:mb-6 shadow-sm border border-gray-100">
        <div className="px-4 md:px-6 py-4 md:py-8">
          <div className="flex flex-col gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-3 bg-violet-50 rounded-xl shadow-sm">
                <ShoppingBag className="h-6 w-6 md:h-8 md:w-8 text-violet-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-3xl font-bold tracking-tight text-slate-800 truncate">
                  Purchase Order Management
                </h1>
                <p className="text-slate-600 text-sm md:text-lg truncate">
                  Manage purchases and orders
                </p>
              </div>
            </div>
            
            {/* Action buttons - scrollable on mobile */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:justify-end">
              <Button variant="outline" onClick={handleExportCSV} size="sm" className="flex-shrink-0">
                <Download className="h-4 w-4 mr-1 md:mr-2" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
              <PermissionGate permissions={["purchase_manage"]} showFallback={false}>
                <ManualPurchaseEntryDialog onSuccess={handleRefreshData} />
                <Button onClick={() => setShowPurchaseOrderDialog(true)} size="sm" className="flex-shrink-0">
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="whitespace-nowrap">New Purchase Stock</span>
                </Button>
              </PermissionGate>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <Card className="mb-4">
        <CardContent className="p-3 md:p-4">
          <div className="flex gap-2 md:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400 hidden md:block" />
                <Input 
                  placeholder="Search orders..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
              <Button variant="outline" onClick={() => setShowFilterDialog(true)} size="sm">
                <Filter className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Filter</span>
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
        <CardContent className="p-3 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 md:mb-6 h-auto">
              <TabsTrigger value="pending" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <span className="truncate">Pending</span>
                {ordersSummary?.pending > 0 && (
                  <Badge variant="secondary" className="text-xs">{ordersSummary.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="review" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <span className="truncate">Review</span>
                {ordersSummary?.review > 0 && (
                  <Badge variant="destructive" className="text-xs">{ordersSummary.review}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <span className="truncate">Completed</span>
                {ordersSummary?.completed > 0 && (
                  <Badge variant="default" className="text-xs">{ordersSummary.completed}</Badge>
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
    </PermissionGate>
  );
}
