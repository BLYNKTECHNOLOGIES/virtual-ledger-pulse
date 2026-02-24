import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Download, ShoppingBag, Filter, Search, TrendingDown, Link2, Package } from "lucide-react";
import { format } from "date-fns";
import { TerminalSyncTab } from "@/components/purchase/TerminalSyncTab";
import { SmallBuysSyncTab } from "@/components/purchase/SmallBuysSyncTab";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingPurchaseOrders } from "@/components/purchase/PendingPurchaseOrders";
import { ReviewNeededOrders } from "@/components/purchase/ReviewNeededOrders";
import { CompletedPurchaseOrders } from "@/components/purchase/CompletedPurchaseOrders";
import { BuyOrdersTab } from "@/components/purchase/BuyOrdersTab";
import { NewPurchaseOrderDialog } from "@/components/purchase/NewPurchaseOrderDialog";
import { ManualPurchaseEntryDialog } from "@/components/purchase/ManualPurchaseEntryDialog";
import { PermissionGate } from "@/components/PermissionGate";
import { Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePurchaseFunctions } from "@/hooks/usePurchaseFunctions";
import { useToast } from "@/hooks/use-toast";

export default function Purchase() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPurchaseOrderDialog, setShowPurchaseOrderDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("buy_orders");
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();

  // Purchase function checks for role-based visibility
  const { canCreateOrders, isLoading: purchaseFunctionsLoading } = usePurchaseFunctions();

  const handleRefreshData = () => {
    // Refetch without a full page reload
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders_export'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['wallets'] });
    queryClient.invalidateQueries({ queryKey: ['wallets-with-details'] });
    queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
    queryClient.invalidateQueries({ queryKey: ['tds-records'] });
  };

  // Fetch terminal sync pending count (today only, matching TerminalSyncTab filter)
  const { data: terminalSyncCount = 0 } = useQuery({
    queryKey: ['terminal-sync-pending-count'],
    queryFn: async () => {
      // Only count today's orders (00:00 IST onwards)
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const nowUTC = Date.now();
      const midnightISTinUTC = Math.floor((nowUTC + IST_OFFSET_MS) / 86400000) * 86400000 - IST_OFFSET_MS;

      const { data, error } = await supabase
        .from('terminal_purchase_sync')
        .select('id, order_data, sync_status')
        .in('sync_status', ['synced_pending_approval', 'client_mapping_pending']);
      if (error) throw error;

      // Filter by today's orders using order create_time from order_data
      return (data || []).filter(record => {
        const od = record.order_data as any;
        const createTime = od?.create_time ? Number(od.create_time) : 0;
        return createTime >= midnightISTinUTC;
      }).length;
    },
  });

  // Fetch purchase orders summary for badges
  const { data: ordersSummary } = useQuery({
    queryKey: ['purchase_orders_summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('status, order_status');
      
      if (error) throw error;
      
      const pending = data?.filter(order => order.status === 'PENDING').length || 0;
      const review = data?.filter(order => order.status === 'REVIEW_NEEDED').length || 0;
      const completed = data?.filter(order => order.status === 'COMPLETED').length || 0;
      const buyOrders = data?.filter(order => order.order_status !== null).length || 0;
      
      return { pending, review, completed, buyOrders };
    },
  });

  // Fetch all purchase orders for export
  const { data: allPurchaseOrders } = useQuery({
    queryKey: ['purchase_orders_export'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          created_by_user:users!created_by(username, first_name, last_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  const handleExportCSV = () => {
    if (!allPurchaseOrders || allPurchaseOrders.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no purchase orders to export.",
        variant: "destructive"
      });
      return;
    }

    const csvHeaders = [
      'Order Number',
      'Supplier Name',
      'Contact Number',
      'State',
      'Product Name',
      'Product Category',
      'Quantity',
      'Price Per Unit',
      'Total Amount',
      'TDS Applied',
      'TDS Amount',
      'PAN Number',
      'Net Payable Amount',
      'Tax Amount',
      'Fee Percentage',
      'Fee Amount',
      'Net Amount',
      'Status',
      'Order Status',
      'Is Off Market',
      'Is Safe Fund',
      'Total Paid',
      'Payment Method Type',
      'UPI ID',
      'Bank Account Name',
      'Bank Account Number',
      'IFSC Code',
      'Warehouse Name',
      'Assigned To',
      'Description',
      'Notes',
      'Created By',
      'Order Date',
      'Created At'
    ];

    const csvData = allPurchaseOrders.map(order => [
      order.order_number || '',
      order.supplier_name || '',
      order.contact_number || '',
      order.client_state || '',
      order.product_name || '',
      order.product_category || '',
      order.quantity || 0,
      order.price_per_unit || 0,
      order.total_amount || 0,
      order.tds_applied ? 'Yes' : 'No',
      order.tds_amount || 0,
      order.pan_number || '',
      order.net_payable_amount || order.total_amount || 0,
      order.tax_amount || 0,
      order.fee_percentage || 0,
      order.fee_amount || 0,
      order.net_amount || order.total_amount || 0,
      order.status || '',
      order.order_status || '',
      order.is_off_market ? 'Yes' : 'No',
      order.is_safe_fund ? 'Yes' : 'No',
      order.total_paid || 0,
      order.payment_method_type || '',
      order.upi_id || '',
      order.bank_account_name || '',
      order.bank_account_number || '',
      order.ifsc_code || '',
      order.warehouse_name || '',
      order.assigned_to || '',
      order.description || '',
      order.notes || '',
      order.created_by_user 
        ? (order.created_by_user.first_name || order.created_by_user.username || '')
        : '',
      order.order_date ? format(new Date(order.order_date), 'MMM dd, yyyy') : '',
      order.created_at ? format(new Date(order.created_at), 'MMM dd, yyyy HH:mm') : ''
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase_orders_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: `Exported ${allPurchaseOrders.length} purchase orders.`
    });
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
              {/* Only show create buttons if user has purchase_manage AND canCreateOrders (Purchase Creator or Combined) */}
              <PermissionGate permissions={["purchase_manage"]} showFallback={false}>
                {canCreateOrders && (
                  <>
                    <ManualPurchaseEntryDialog onSuccess={handleRefreshData} />
                    <Button onClick={() => setShowPurchaseOrderDialog(true)} size="sm" className="flex-shrink-0">
                      <Plus className="h-4 w-4 mr-1" />
                      <span className="whitespace-nowrap">New Purchase Stock</span>
                    </Button>
                  </>
                )}
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
            <TabsList className="grid w-full grid-cols-6 mb-4 md:mb-6 h-auto">
              <TabsTrigger value="buy_orders" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <TrendingDown className="h-3 w-3 md:h-4 md:w-4" />
                <span className="truncate">Buy Orders</span>
                {ordersSummary?.buyOrders ? (
                  <Badge variant="secondary" className="text-xs">{ordersSummary.buyOrders}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <span className="truncate">Pending</span>
                {ordersSummary?.pending ? (
                  <Badge variant="secondary" className="text-xs">{ordersSummary.pending}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="review" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <span className="truncate">Review</span>
                {ordersSummary?.review ? (
                  <Badge variant="destructive" className="text-xs">{ordersSummary.review}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <span className="truncate">Completed</span>
                {ordersSummary?.completed ? (
                  <Badge variant="default" className="text-xs">{ordersSummary.completed}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="terminal_sync" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <Link2 className="h-3 w-3 md:h-4 md:w-4" />
                <span className="truncate">Terminal Sync</span>
                {terminalSyncCount > 0 ? (
                  <Badge variant="default" className="text-xs">{terminalSyncCount}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="small_buys" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <Package className="h-3 w-3 md:h-4 md:w-4" />
                <span className="truncate">Small Buys</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buy_orders">
              <BuyOrdersTab
                searchTerm={searchTerm}
                dateFrom={filterDateFrom}
                dateTo={filterDateTo}
              />
            </TabsContent>

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

            <TabsContent value="terminal_sync">
              <TerminalSyncTab />
            </TabsContent>

            <TabsContent value="small_buys">
              <SmallBuysSyncTab />
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
