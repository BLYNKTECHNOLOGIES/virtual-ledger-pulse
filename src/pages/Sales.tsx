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
import { CalendarIcon, Plus, Search, Filter, Download, Edit, Trash2, Eye, ShoppingCart } from "lucide-react";
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

import { useToast } from "@/hooks/use-toast";

export default function Sales() {
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
    order.payment_status === 'PENDING' || order.payment_status === 'USER_PAYING'
  ) || [];
  const completedOrders = salesOrders?.filter(order => 
    order.payment_status === 'COMPLETED' || order.payment_status === 'PAYMENT_DONE'
  ) || [];

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

  const renderOrdersTable = (orders: any[]) => (
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
                   {order.payment_status === 'USER_PAYING' ? (
                     // Special action for User Paying orders
                     <Button 
                       variant="outline" 
                       size="sm"
                       onClick={() => setSelectedOrderForUserPaying(order)}
                       className="bg-blue-50 hover:bg-blue-100 text-blue-700"
                     >
                       Take Action
                     </Button>
                   ) : (
                     // Default actions for other orders
                     <>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            console.log('View Details clicked for order:', order);
                            setSelectedOrderForDetails(order);
                          }}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            console.log('Edit clicked for order:', order);
                            setSelectedOrderForEdit(order);
                          }}
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
                     </>
                   )}
                 </div>
               </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No orders found for this category.
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-emerald-50 rounded-xl shadow-sm">
                  <ShoppingCart className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Sales Order Processing
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Comprehensive sales order management and processing
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => setShowManualSalesEntry(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Manual Sales Entry
              </Button>
              <Button 
                onClick={() => setShowStepByStepFlow(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Order
              </Button>
            </div>
          </div>
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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">
                  Pending Orders ({pendingOrders.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed Orders ({completedOrders.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="pending" className="mt-6">
                {renderOrdersTable(pendingOrders)}
              </TabsContent>
              
              <TabsContent value="completed" className="mt-6">
                {renderOrdersTable(completedOrders)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Step-by-Step Sales Flow */}
          <StepBySalesFlow 
            open={showStepByStepFlow} 
            onOpenChange={setShowStepByStepFlow}
            queryClient={queryClient}
          />

      {/* Manual Sales Entry Dialog */}
      <SalesEntryDialog
        open={showManualSalesEntry}
        onOpenChange={setShowManualSalesEntry}
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

      {/* User Paying Status Dialog */}
      <UserPayingStatusDialog
        open={!!selectedOrderForUserPaying}
        onOpenChange={(open) => !open && setSelectedOrderForUserPaying(null)}
        clientName={selectedOrderForUserPaying?.client_name || ''}
        orderAmount={selectedOrderForUserPaying?.total_amount || 0}
        onStatusChange={(status) => {
          if (status === "PAYMENT_DONE") {
            // Show completion form instead of directly updating status
            setSelectedOrderForUserPaying(null);
            setSelectedOrderForCompletion(selectedOrderForUserPaying);
          } else {
            // Handle other status changes (ORDER_CANCELLED)
            if (selectedOrderForUserPaying) {
              updateOrderStatusMutation.mutate({
                orderId: selectedOrderForUserPaying.id,
                status: status
              });
              setSelectedOrderForUserPaying(null);
            }
          }
        }}
        onAlternativeMethod={() => {
          setSelectedOrderForUserPaying(null);
          setSelectedOrderForAlternativeMethod(selectedOrderForUserPaying);
        }}
      />

      {/* Alternative Payment Method Dialog */}
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

      {/* Order Completion Form */}
      <OrderCompletionForm
        open={!!selectedOrderForCompletion}
        onOpenChange={(open) => !open && setSelectedOrderForCompletion(null)}
        order={selectedOrderForCompletion}
      />
    </div>
  );
}
