
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
import { CalendarIcon, Plus, Search, Filter, Download, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SalesWorkflowManager } from "@/components/sales/SalesWorkflowManager";

export default function Sales() {
  const [showSalesWorkflow, setShowSalesWorkflow] = useState(false);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();

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
      return data;
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-100 text-green-800">✅ Payment Received</Badge>;
      case "PARTIAL":
        return <Badge className="bg-yellow-100 text-yellow-800">🟡 Partial Payment</Badge>;
      case "PENDING":
        return <Badge className="bg-blue-100 text-blue-800">⏳ Pending</Badge>;
      case "FAILED":
        return <Badge className="bg-red-100 text-red-800">❌ Failed</Badge>;
      case "CANCELLED":
        return <Badge className="bg-gray-100 text-gray-800">🔴 Cancelled</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getRiskLevelBadge = (level: string) => {
    switch (level) {
      case 'HIGH':
        return <Badge className="bg-red-100 text-red-800">High Risk</Badge>;
      case 'MEDIUM':
        return <Badge className="bg-yellow-100 text-yellow-800">Medium Risk</Badge>;
      case 'LOW':
        return <Badge className="bg-green-100 text-green-800">Low Risk</Badge>;
      default:
        return null;
    }
  };

  const clearFilters = () => {
    setFilterPaymentStatus("");
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearchTerm("");
    setShowFilterDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🧾 Sales Order Processing</h1>
          <p className="text-gray-600 mt-1">Core Sales Processing Module - Track orders from creation to payment confirmation</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setShowSalesWorkflow(true)} className="bg-blue-600 hover:bg-blue-700">
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
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
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

      {/* Sales Orders Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Orders Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading sales orders...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Order #</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Platform</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Qty × Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">COSMOS</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrders?.map((order) => (
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
                      <td className="py-3 px-4">{order.platform || '-'}</td>
                      <td className="py-3 px-4 font-medium">₹{order.amount?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-sm">
                        {order.quantity || 1} × ₹{order.price_per_unit?.toLocaleString() || order.amount?.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(order.payment_status)}</td>
                      <td className="py-3 px-4">
                        {order.cosmos_alert && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Alert
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">{format(new Date(order.order_date), 'MMM dd, yyyy')}</td>
                      <td className="py-3 px-4">
                        {order.attachment_urls && order.attachment_urls.length > 0 ? (
                          <div className="flex gap-1">
                            {order.attachment_urls.slice(0, 2).map((url, index) => (
                              <Button
                                key={index}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => window.open(url, '_blank')}
                              >
                                <FileText className="h-3 w-3" />
                              </Button>
                            ))}
                            {order.attachment_urls.length > 2 && (
                              <span className="text-xs text-gray-500">
                                +{order.attachment_urls.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {salesOrders?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No sales orders found. Create your first sales order to get started.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales Workflow Manager */}
      <SalesWorkflowManager 
        open={showSalesWorkflow} 
        onOpenChange={setShowSalesWorkflow}
      />
    </div>
  );
}
