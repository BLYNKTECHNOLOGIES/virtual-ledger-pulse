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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CalendarIcon, Plus, Search, Filter, Download, Edit, Trash2, Eye, Settings, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StepBySalesFlow } from "@/components/sales/StepBySalesFlow";
import { SalesOrderDetailsDialog } from "@/components/sales/SalesOrderDetailsDialog";
import { EditSalesOrderDialog } from "@/components/sales/EditSalesOrderDialog";
import { OrderStatusDialog } from "@/components/sales/OrderStatusDialog";
import { useToast } from "@/hooks/use-toast";

export default function Sales() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showStepByStepFlow, setShowStepByStepFlow] = useState(false);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<any>(null);
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [alternativeMethodDialog, setAlternativeMethodDialog] = useState<any>(null);
  const [stepFlowMode, setStepFlowMode] = useState<'normal' | 'alternative-same-type' | 'alternative-change-type'>('normal');

  // Fetch sales orders from database
  const { data: salesOrders, isLoading } = useQuery({
    queryKey: ['sales_orders', searchTerm, filterPaymentStatus, filterDateFrom, filterDateTo],
    queryFn: async () => {
      let query = supabase
        .from('sales_orders')
        .select('*')
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
    order.payment_status === 'PENDING' || order.status === 'AWAITING_PAYMENT'
  ) || [];
  const completedOrders = salesOrders?.filter(order => order.payment_status === 'COMPLETED') || [];

  // Enhanced generate alternative payment method mutation
  const generateAlternativeMethodMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const order = salesOrders?.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

      // Get the current payment method to determine the type and risk category
      const { data: currentPaymentMethod } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(account_name, bank_name, account_number, IFSC, bank_account_holder_name)')
        .eq('id', order.sales_payment_method_id)
        .single();

      if (!currentPaymentMethod) throw new Error('Current payment method not found');

      // Find alternative payment methods of the same type and risk category
      const { data: allAlternativeMethods } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(account_name, bank_name, account_number, IFSC, bank_account_holder_name)')
        .eq('is_active', true)
        .eq('type', currentPaymentMethod.type)
        .eq('risk_category', currentPaymentMethod.risk_category)
        .neq('id', currentPaymentMethod.id);

      // Filter methods that have available capacity
      const availableSameMethods = (allAlternativeMethods || []).filter(method => 
        (method.current_usage || 0) < method.payment_limit
      );

      // Check if there are methods of different types available
      const { data: differentTypeMethods } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(account_name, bank_name, account_number, IFSC, bank_account_holder_name)')
        .eq('is_active', true)
        .eq('risk_category', currentPaymentMethod.risk_category)
        .neq('type', currentPaymentMethod.type);

      const availableDifferentTypes = (differentTypeMethods || []).filter(method => 
        (method.current_usage || 0) < method.payment_limit
      );

      // Show dialog asking if they want to change payment method type
      setAlternativeMethodDialog({
        order,
        currentPaymentMethod,
        availableSameType: availableSameMethods,
        differentTypeMethods: availableDifferentTypes
      });
      
      return null;
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  const handleAlternativeMethodChoice = (choice: 'same-type' | 'change-type') => {
    if (!alternativeMethodDialog) return;

    if (choice === 'same-type') {
      // Open step-by-step flow in alternative mode (goes to step 4 directly)
      setStepFlowMode('alternative-same-type');
      setShowStepByStepFlow(true);
    } else {
      // Open step-by-step flow to change payment method type (goes to step 3)
      setStepFlowMode('alternative-change-type');
      setShowStepByStepFlow(true);
    }
    
    setAlternativeMethodDialog(null);
  };

  const handleStepFlowClose = () => {
    setShowStepByStepFlow(false);
    setStepFlowMode('normal');
    setAlternativeMethodDialog(null);
  };

  // Move to leads mutation
  const moveToLeadsMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const order = salesOrders?.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

      // Create lead entry
      const { error: leadError } = await supabase
        .from('leads')
        .insert({
          name: order.client_name,
          contact_number: order.client_phone,
          description: `Payment failed for order: ${order.order_number}`,
          estimated_order_value: order.total_amount,
          status: 'NEW',
          source: 'Payment Failed Order'
        });

      if (leadError) throw leadError;

      // Delete the order
      const { error: deleteError } = await supabase
        .from('sales_orders')
        .delete()
        .eq('id', orderId);

      if (deleteError) throw deleteError;
      
      return true;
    },
    onSuccess: () => {
      toast({ title: "Order Moved", description: "Order moved to leads due to payment failure" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to move order to leads: ${error.message}`, variant: "destructive" });
    }
  });

  // Mark payment received mutation
  const markPaymentReceivedMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from('sales_orders')
        .update({
          status: 'COMPLETED',
          payment_status: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Payment marked as received, order completed" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to mark payment as received: ${error.message}`, variant: "destructive" });
    }
  });

  // Payment method assigned mutation
  const paymentMethodAssignedMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from('sales_orders')
        .update({
          status: 'AWAITING_PAYMENT',
          payment_status: 'PENDING',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Payment method assigned, awaiting payment" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to assign payment method: ${error.message}`, variant: "destructive" });
    }
  });

  // Delete sales order mutation
  const deleteSalesOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const order = salesOrders?.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

      // Start a transaction to revert all changes
      const { error: deleteError } = await supabase
        .from('sales_orders')
        .delete()
        .eq('id', orderId);

      if (deleteError) throw deleteError;

      // Revert bank transaction if exists
      if (order.sales_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id')
          .eq('id', order.sales_payment_method_id)
          .single();

        if (paymentMethod?.bank_account_id) {
          // Remove the bank transaction
          await supabase
            .from('bank_transactions')
            .delete()
            .eq('reference_number', order.order_number)
            .eq('bank_account_id', paymentMethod.bank_account_id);

          // Update payment method usage
          await supabase
            .from('sales_payment_methods')
            .update({
              current_usage: Math.max(0, (await supabase.from('sales_payment_methods').select('current_usage').eq('id', order.sales_payment_method_id).single()).data?.current_usage - order.total_amount),
              updated_at: new Date().toISOString()
            })
            .eq('id', order.sales_payment_method_id);
        }
      }

      // Revert product stock if product is linked
      if (order.product_id) {
        const { data: product } = await supabase
          .from('products')
          .select('current_stock_quantity, total_sales')
          .eq('id', order.product_id)
          .single();

        if (product) {
          await supabase
            .from('products')
            .update({
              current_stock_quantity: product.current_stock_quantity + order.quantity,
              total_sales: Math.max(0, (product.total_sales || 0) - order.quantity)
            })
            .eq('id', order.product_id);
        }

        // Remove stock transaction
        await supabase
          .from('stock_transactions')
          .delete()
          .eq('reference_number', order.order_number)
          .eq('product_id', order.product_id);
      }

      return orderId;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales order deleted and all changes reverted successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
    },
    onError: (error) => {
      console.error('Error deleting sales order:', error);
      toast({ title: "Error", description: "Failed to delete sales order", variant: "destructive" });
    }
  });

  const handleExportCSV = () => {
    if (!salesOrders || salesOrders.length === 0) return;

    const csvHeaders = [
      'Order Number',
      'Customer',
      'Platform', 
      'Amount',
      'Quantity',
      'Price Per Unit',
      'Status',
      'Date',
      'Created At'
    ];

    const csvData = salesOrders.map(order => [
      order.order_number,
      order.client_name,
      order.platform || '',
      order.total_amount,
      order.quantity || 1,
      order.price_per_unit || order.total_amount,
      order.payment_status,
      format(new Date(order.order_date), 'MMM dd, yyyy'),
      format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
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
        return <Badge className="bg-green-100 text-green-800">Payment Received</Badge>;
      case "PARTIAL":
        return <Badge className="bg-yellow-100 text-yellow-800">Partial Payment</Badge>;
      case "PENDING":
        return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
      case "FAILED":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
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

  const renderPendingOrdersTable = (orders: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium text-gray-600">Order #</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Platform</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Amount</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Qty</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Price</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b hover:bg-gray-50">
              <td className="py-3 px-4 font-mono text-sm">{order.order_number}</td>
              <td className="py-3 px-4">
                <div>
                  <div className="font-medium">{order.client_name}</div>
                  {order.description && (
                    <div className="text-sm text-gray-500 max-w-[200px] truncate">
                      {order.description}
                    </div>
                  )}
                </div>
              </td>
              <td className="py-3 px-4">{order.platform}</td>
              <td className="py-3 px-4 font-medium">₹{Number(order.total_amount).toLocaleString()}</td>
              <td className="py-3 px-4">{order.quantity || 1}</td>
              <td className="py-3 px-4">₹{Number(order.price_per_unit || order.total_amount).toLocaleString()}</td>
              <td className="py-3 px-4">{getStatusBadge(order.payment_status)}</td>
              <td className="py-3 px-4">{format(new Date(order.order_date), 'MMM dd, yyyy')}</td>
              <td className="py-3 px-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Take Action
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => generateAlternativeMethodMutation.mutate(order.id)}>
                      🔄 Generate Alternative Method
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => moveToLeadsMutation.mutate(order.id)}>
                      ❌ Payment Failed - Shift to Lead
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => markPaymentReceivedMutation.mutate(order.id)}>
                      ✅ Payment Received
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => paymentMethodAssignedMutation.mutate(order.id)}>
                      📥 Payment Method Assigned
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No pending orders found.
        </div>
      )}
    </div>
  );

  const renderCompletedOrdersTable = (orders: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium text-gray-600">Order #</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Customer</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Platform</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Amount</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Qty</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Price</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b hover:bg-gray-50">
              <td className="py-3 px-4 font-mono text-sm">{order.order_number}</td>
              <td className="py-3 px-4">
                <div>
                  <div className="font-medium">{order.client_name}</div>
                  {order.description && (
                    <div className="text-sm text-gray-500 max-w-[200px] truncate">
                      {order.description}
                    </div>
                  )}
                </div>
              </td>
              <td className="py-3 px-4">{order.platform}</td>
              <td className="py-3 px-4 font-medium">₹{Number(order.total_amount).toLocaleString()}</td>
              <td className="py-3 px-4">{order.quantity || 1}</td>
              <td className="py-3 px-4">₹{Number(order.price_per_unit || order.total_amount).toLocaleString()}</td>
              <td className="py-3 px-4">{getStatusBadge(order.payment_status)}</td>
              <td className="py-3 px-4">{format(new Date(order.order_date), 'MMM dd, yyyy')}</td>
              <td className="py-3 px-4">
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedOrderForDetails(order)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View Details
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedOrderForEdit(order)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDeleteOrder(order.id)}
                    disabled={deleteSalesOrderMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No completed orders found.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sales Order Processing</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => {
            setStepFlowMode('normal');
            setShowStepByStepFlow(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input 
                placeholder="Search by order number, customer name, platform..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
              <Button variant="outline" onClick={() => setShowFilterDialog(true)}>
                <Filter className="h-4 w-4 mr-2" />
                Filter
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
                        <SelectItem value="PARTIAL">Partial</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">
                  Pending Orders ({pendingOrders.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed Orders ({completedOrders.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="pending" className="mt-6">
                {renderPendingOrdersTable(pendingOrders)}
              </TabsContent>
              
              <TabsContent value="completed" className="mt-6">
                {renderCompletedOrdersTable(completedOrders)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Alternative Payment Method Choice Dialog */}
      <Dialog open={!!alternativeMethodDialog} onOpenChange={(open) => !open && setAlternativeMethodDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alternative Payment Method - Same Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {alternativeMethodDialog?.availableSameType?.length > 0 ? (
              <>
                <p className="text-sm text-gray-600">
                  Do you want to change the payment method type or keep the same type and get an alternative method?
                </p>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => handleAlternativeMethodChoice('same-type')}
                    className="flex-1"
                  >
                    No (Keep Same Type)
                  </Button>
                  <Button 
                    onClick={() => handleAlternativeMethodChoice('change-type')}
                    className="flex-1"
                  >
                    Yes (Change Payment Method Type)
                  </Button>
                </div>
              </>
            ) : alternativeMethodDialog?.differentTypeMethods?.length > 0 ? (
              <>
                <p className="text-sm text-gray-600">
                  No alternative methods available for the current payment type. Would you like to change the payment method type?
                </p>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setAlternativeMethodDialog(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => handleAlternativeMethodChoice('change-type')}
                    className="flex-1"
                  >
                    Yes (Change Payment Method Type)
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  All possible payment methods have been provided. No available methods left. Contact your admin.
                </p>
                <div className="flex justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => setAlternativeMethodDialog(null)}
                  >
                    OK
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Step-by-Step Sales Flow */}
      <StepBySalesFlow 
        open={showStepByStepFlow}
        onOpenChange={handleStepFlowClose}
        mode={stepFlowMode}
        alternativeOrderData={alternativeMethodDialog}
      />

      {/* Details Dialog */}
      <SalesOrderDetailsDialog
        open={!!selectedOrderForDetails}
        onOpenChange={(open) => !open && setSelectedOrderForDetails(null)}
        order={selectedOrderForDetails}
      />

      {/* Edit Dialog */}
      <EditSalesOrderDialog
        open={!!selectedOrderForEdit}
        onOpenChange={(open) => !open && setSelectedOrderForEdit(null)}
        order={selectedOrderForEdit}
      />

      {/* Status Change Dialog */}
      <OrderStatusDialog
        open={!!selectedOrderForStatus}
        onOpenChange={(open) => !open && setSelectedOrderForStatus(null)}
        order={selectedOrderForStatus}
      />
    </div>
  );
}
