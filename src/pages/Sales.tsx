import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, Plus, Search, Filter, Download, Edit, Trash2, Eye, ShoppingCart, Shield, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StepBySalesFlow } from "@/components/sales/StepBySalesFlow";
import { SalesOrderDetailsDialog } from "@/components/sales/SalesOrderDetailsDialog";
import { EditSalesOrderDialog } from "@/components/sales/EditSalesOrderDialog";
import { SalesEntryDialog } from "@/components/sales/SalesEntryDialog";
import { UserPayingStatusDialog } from "@/components/sales/UserPayingStatusDialog";
import { PaymentMethodSelectionDialog } from "@/components/sales/PaymentMethodSelectionDialog";
import { OrderCompletionForm } from "@/components/sales/OrderCompletionForm";
import { PermissionGate } from "@/components/PermissionGate";
import { TerminalSalesSyncTab } from "@/components/sales/TerminalSalesSyncTab";
import { SmallSalesSyncTab } from "@/components/sales/SmallSalesSyncTab";

import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function Sales() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showStepByStepFlow, setShowStepByStepFlow] = useState(false);
  const [showManualSalesEntry, setShowManualSalesEntry] = useState(false);
  
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<any>(null);
  const [selectedOrderForUserPaying, setSelectedOrderForUserPaying] = useState<any>(null);
  const [selectedOrderForAlternativeMethod, setSelectedOrderForAlternativeMethod] = useState<any>(null);
  const [selectedOrderForCompletion, setSelectedOrderForCompletion] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch sales orders from database
  const { data: salesOrders, isLoading } = useQuery({
    queryKey: ['sales_orders', searchTerm, filterPaymentStatus, filterDateFrom, filterDateTo],
    queryFn: async () => {
      let query = supabase
        .from('sales_orders')
        .select(`
          *,
          created_by_user:users!created_by(username, first_name, last_name),
          wallet:wallets!wallet_id(wallet_name)
        `)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`order_number.ilike.%${searchTerm}%,client_name.ilike.%${searchTerm}%`);
      }

      if (filterPaymentStatus) {
        query = query.eq('payment_status', filterPaymentStatus);
      }

      if (filterDateFrom) {
        query = query.gte('order_date', format(filterDateFrom, 'yyyy-MM-dd'));
      }

      if (filterDateTo) {
        query = query.lte('order_date', format(filterDateTo, 'yyyy-MM-dd'));
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Filter orders based on active tab
  const pendingOrders = salesOrders?.filter(order => 
    order.payment_status === 'PENDING' || order.payment_status === 'USER_PAYING'
  ) || [];
  const completedOrders = salesOrders?.filter(order => 
    order.payment_status === 'COMPLETED' || order.payment_status === 'PAYMENT_DONE'
  ) || [];

  const deleteSalesOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('delete_sales_order_with_reversal', {
        p_order_id: orderId
      });

      if (error) throw error;
      return orderId;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales order deleted and all changes reverted successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['crypto_wallets'] });
    },
    onError: (error) => {
      console.error('Error deleting sales order:', error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to delete sales order",
        variant: "destructive",
      });
    }
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from('sales_orders')
        .update({ 
          payment_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;
      return { orderId, status };
    },
    onSuccess: (data) => {
      toast({ 
        title: "Success", 
        description: `Order status updated to ${data.status.replace('_', ' ').toLowerCase()}` 
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
    },
    onError: (error) => {
      console.error('Error updating order status:', error);
      toast({ 
        title: "Error", 
        description: "Failed to update order status", 
        variant: "destructive" 
      });
    }
  });

  const handleExportCSV = () => {
    if (!salesOrders || salesOrders.length === 0) return;

    const csvHeaders = [
      'Order Number',
      'Customer',
      'Phone',
      'State',
      'Platform', 
      'Amount',
      'Quantity',
      'Price Per Unit',
      'Fee Percentage',
      'Fee Amount',
      'Net Amount',
      'Status',
      'Payment Status',
      'Settlement Status',
      'Is Off Market',
      'Description',
      'Risk Level',
      'Created By',
      'Date',
      'Created At'
    ];

    const csvData = salesOrders.map(order => [
      order.order_number,
      order.client_name,
      order.client_phone || '',
      order.client_state || '',
      order.platform || '',
      order.total_amount,
      order.quantity || 1,
      order.price_per_unit || order.total_amount,
      order.fee_percentage || 0,
      order.fee_amount || 0,
      order.net_amount || order.total_amount,
      order.status || '',
      order.payment_status || '',
      order.settlement_status || '',
      order.is_off_market ? 'Yes' : 'No',
      order.description || '',
      order.risk_level || '',
      order.created_by_user 
        ? (order.created_by_user.first_name || order.created_by_user.username || '')
        : '',
      format(new Date(order.order_date), 'MMM dd, yyyy'),
      format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_orders_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "PAYMENT_DONE":
        return <Badge className="bg-green-100 text-green-800">Payment Done</Badge>;
      case "USER_PAYING":
        return <Badge className="bg-blue-100 text-blue-800">User Paying</Badge>;
      case "PARTIAL":
        return <Badge className="bg-yellow-100 text-yellow-800">Partial Payment</Badge>;
      case "PENDING":
        return <Badge className="bg-gray-100 text-gray-800">Pending</Badge>;
      case "FAILED":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case "ORDER_CANCELLED":
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const clearFilters = () => {
    setFilterPaymentStatus("");
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearchTerm("");
    setShowFilterDialog(false);
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (confirm('Are you sure you want to delete this order? This will revert all related changes.')) {
      deleteSalesOrderMutation.mutate(orderId);
    }
  };

  // Mobile-friendly card view for orders
  const renderMobileOrderCard = (order: any, isCompleted: boolean = false) => (
    <Card key={order.id} className="mb-3">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-mono text-sm font-medium">{order.order_number}</p>
            <p className="font-semibold text-lg">{order.client_name}</p>
          </div>
          {getStatusBadge(order.payment_status)}
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <span className="text-gray-500">Amount:</span>
            <p className="font-medium">₹{Number(order.total_amount).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-500">Quantity:</span>
            <p className="font-medium">{order.quantity || 1}</p>
          </div>
          <div>
            <span className="text-gray-500">Platform:</span>
            <p className="font-medium">{order.wallet?.wallet_name || order.platform || 'Off Market'}</p>
          </div>
          <div>
            <span className="text-gray-500">Date:</span>
            <p className="font-medium">
              {format(new Date(order.order_date), 'MMM dd')}{' '}
              <span className="text-xs text-muted-foreground">
                {format(new Date(order.created_at || order.order_date), 'HH:mm')}
              </span>
            </p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Created By:</span>
            <p className="font-medium">
              {order.created_by_user 
                ? (order.created_by_user.first_name || order.created_by_user.username)
                : <span className="text-muted-foreground">N/A</span>}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2 border-t flex-wrap">
          {order.payment_status === 'USER_PAYING' ? (
            <PermissionGate permissions={["sales_manage"]} showFallback={false}>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setSelectedOrderForUserPaying(order)}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 flex-1"
              >
                Take Action
              </Button>
            </PermissionGate>
          ) : (
            <>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedOrderForDetails(order)}
                className="text-blue-600 flex-1"
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <PermissionGate permissions={["sales_manage"]} showFallback={false}>
                <Button 
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedOrderForEdit(order)}
                  className="text-green-600 flex-1"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleDeleteOrder(order.id)}
                  disabled={deleteSalesOrderMutation.isPending}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </PermissionGate>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderOrdersTable = (orders: any[], isCompleted: boolean = false) => (
    <>
      {/* Mobile view - cards */}
      <div className="md:hidden space-y-3">
        {orders.map((order) => renderMobileOrderCard(order, isCompleted))}
        {orders.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No orders found for this category.
          </div>
        )}
      </div>
      
      {/* Desktop view - table */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                <TableCell>
                  <div className="font-medium">{order.client_name}</div>
                  {order.description && (
                    <div className="text-sm text-gray-500 max-w-[200px] truncate">
                      {order.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>{order.wallet?.wallet_name || order.platform || 'Off Market'}</TableCell>
                <TableCell className="font-medium">₹{Number(order.total_amount).toLocaleString()}</TableCell>
                <TableCell>{order.quantity || 1}</TableCell>
                <TableCell>₹{Number(order.price_per_unit || order.total_amount).toLocaleString()}</TableCell>
                <TableCell>{getStatusBadge(order.payment_status)}</TableCell>
                <TableCell>
                  {order.created_by_user ? (
                    <span className="font-medium text-gray-700">
                      {order.created_by_user.first_name || order.created_by_user.username}
                    </span>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{format(new Date(order.order_date), 'MMM dd, yyyy')}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(order.created_at || order.order_date), 'HH:mm:ss')}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {order.payment_status === 'USER_PAYING' ? (
                      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrderForUserPaying(order)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700"
                        >
                          Take Action
                        </Button>
                      </PermissionGate>
                    ) : (
                      <>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedOrderForDetails(order)}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <PermissionGate permissions={["sales_manage"]} showFallback={false}>
                          <Button 
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedOrderForEdit(order)}
                            className="text-green-600 hover:text-green-800 hover:bg-green-50"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeleteOrder(order.id)}
                            disabled={deleteSalesOrderMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </PermissionGate>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {orders.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No orders found for this category.
          </div>
        )}
      </div>
    </>
  );

  return (
    <PermissionGate
      permissions={["sales_view"]}
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Sales Management.
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
              <div className="p-2 md:p-3 bg-emerald-50 rounded-xl shadow-sm">
                <ShoppingCart className="h-6 w-6 md:h-8 md:w-8 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-3xl font-bold tracking-tight text-slate-800 truncate">
                  Sales Order Processing
                </h1>
                <p className="text-slate-600 text-sm md:text-lg truncate">
                  Manage and process sales orders
                </p>
              </div>
            </div>
            
            {/* Action buttons - scrollable on mobile */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:justify-end">
              <Button variant="outline" onClick={handleExportCSV} size="sm" className="flex-shrink-0">
                <Download className="h-4 w-4 mr-1 md:mr-2" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <PermissionGate permissions={["sales_manage"]} showFallback={false}>
                <Button variant="outline" onClick={() => setShowManualSalesEntry(true)} size="sm" className="flex-shrink-0">
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="whitespace-nowrap">Manual Entry</span>
                </Button>
                <Button 
                  onClick={() => setShowStepByStepFlow(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="whitespace-nowrap">New Order</span>
                </Button>
              </PermissionGate>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card className="mb-4">
        <CardContent className="p-3 md:p-4">
          <div className="flex gap-2 md:gap-4">
            <div className="flex-1">
              <Input 
                placeholder="Search orders..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm"
              />
            </div>
            <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
              <Button variant="outline" onClick={() => setShowFilterDialog(true)} size="sm">
                <Filter className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Filter</span>
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Filter Sales Orders</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Payment Status</Label>
                    <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="USER_PAYING">User Paying</SelectItem>
                        <SelectItem value="PAYMENT_DONE">Payment Done</SelectItem>
                        <SelectItem value="PARTIAL">Partial</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
                        <SelectItem value="ORDER_CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date From</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !filterDateFrom && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {filterDateFrom ? format(filterDateFrom, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={filterDateFrom}
                            onSelect={setFilterDateFrom}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div>
                      <Label>Date To</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !filterDateTo && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {filterDateTo ? format(filterDateTo, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={filterDateTo}
                            onSelect={setFilterDateTo}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                    <Button onClick={() => setShowFilterDialog(false)}>
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sales Orders Dashboard with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Orders Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading sales orders...</div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="pending">
                  Pending ({pendingOrders.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({completedOrders.length})
                </TabsTrigger>
                <TabsTrigger value="terminal-sync">
                  Terminal Sync
                </TabsTrigger>
                <TabsTrigger value="small-sales">
                  Small Sales
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-6">
                {renderOrdersTable(pendingOrders, false)}
              </TabsContent>
              
              <TabsContent value="completed" className="mt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600 font-medium">
                    <CheckCircle className="h-5 w-5" />
                    Completed Sales Orders
                  </div>
                  {renderOrdersTable(completedOrders, true)}
                </div>
              </TabsContent>

              <TabsContent value="terminal-sync" className="mt-6">
                <TerminalSalesSyncTab />
              </TabsContent>

              <TabsContent value="small-sales" className="mt-6">
                <SmallSalesSyncTab />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Step-by-Step Sales Flow */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <StepBySalesFlow 
          open={showStepByStepFlow}
          onOpenChange={setShowStepByStepFlow}
          queryClient={queryClient}
        />
      </PermissionGate>

      {/* Manual Sales Entry Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <SalesEntryDialog
          open={showManualSalesEntry}
          onOpenChange={setShowManualSalesEntry}
        />
      </PermissionGate>

      {/* Details Dialog */}
      <SalesOrderDetailsDialog
        open={!!selectedOrderForDetails}
        onOpenChange={(open) => !open && setSelectedOrderForDetails(null)}
        order={selectedOrderForDetails}
      />

      {/* Edit Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <EditSalesOrderDialog
          open={!!selectedOrderForEdit}
          onOpenChange={(open) => !open && setSelectedOrderForEdit(null)}
          order={selectedOrderForEdit}
        />
      </PermissionGate>

      {/* User Paying Status Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <UserPayingStatusDialog
          open={!!selectedOrderForUserPaying}
          onOpenChange={(open) => !open && setSelectedOrderForUserPaying(null)}
          clientName={selectedOrderForUserPaying?.client_name || ''}
          orderAmount={selectedOrderForUserPaying?.total_amount || 0}
          onStatusChange={(status) => {
            // Capture the order reference immediately before any state changes
            const orderToUpdate = selectedOrderForUserPaying;
            
            if (status === "PAYMENT_DONE") {
              // Show completion form instead of directly updating status
              setSelectedOrderForUserPaying(null);
              setSelectedOrderForCompletion(orderToUpdate);
            } else {
              // Handle other status changes (ORDER_CANCELLED)
              if (!orderToUpdate) return;

              if (status === "ORDER_CANCELLED") {
                // IMPORTANT: Some legacy DB triggers currently break UPDATE on sales_orders
                // with error: record "new" has no field "order_type".
                // To keep business logic intact (reversal + cleanup), cancel this pending order
                // using the existing reversal RPC (same behavior as normal deletion).
                deleteSalesOrderMutation.mutate(orderToUpdate.id);
                return;
              }

              updateOrderStatusMutation.mutate({
                orderId: orderToUpdate.id,
                status: status
              });
            }
          }}
          onAlternativeMethod={() => {
            setSelectedOrderForUserPaying(null);
            setSelectedOrderForAlternativeMethod(selectedOrderForUserPaying);
          }}
        />
      </PermissionGate>

      {/* Alternative Payment Method Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <PaymentMethodSelectionDialog
          open={!!selectedOrderForAlternativeMethod}
          onOpenChange={(open) => !open && setSelectedOrderForAlternativeMethod(null)}
          orderAmount={selectedOrderForAlternativeMethod?.total_amount || 0}
          clientName={selectedOrderForAlternativeMethod?.client_name || ''}
          orderId={selectedOrderForAlternativeMethod?.id || ''}
          riskCategory="MEDIUM"
          paymentType="UPI"
          onStatusChange={(status) => {
            if (selectedOrderForAlternativeMethod) {
              updateOrderStatusMutation.mutate({
                orderId: selectedOrderForAlternativeMethod.id,
                status: status
              });
              setSelectedOrderForAlternativeMethod(null);
            }
          }}
        />
      </PermissionGate>

      {/* Order Completion Form */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <OrderCompletionForm
          open={!!selectedOrderForCompletion}
          onOpenChange={(open) => !open && setSelectedOrderForCompletion(null)}
          order={selectedOrderForCompletion}
        />
      </PermissionGate>
    </div>
    </PermissionGate>
  );
}
