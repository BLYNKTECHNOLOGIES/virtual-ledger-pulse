
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Filter, Download, FileText, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EnhancedPurchaseOrderDialog } from "@/components/purchase/EnhancedPurchaseOrderDialog";

export default function Purchase() {
  const [showPurchaseOrderDialog, setShowPurchaseOrderDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch purchase orders from database with enhanced data
  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name),
          purchase_payment_methods:purchase_payment_method_id(type, bank_account_name),
          purchase_order_items(
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            products(name, code)
          )
        `)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`order_number.ilike.%${searchTerm}%,supplier_name.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const handleExportCSV = () => {
    if (!purchaseOrders || purchaseOrders.length === 0) return;

    const csvHeaders = [
      'Order Number',
      'Supplier',
      'Contact Number',
      'Product Name',
      'Quantity',
      'Unit Price',
      'Total Amount',
      'Payment Method',
      'Warehouse',
      'Status',
      'Date',
      'Created At'
    ];

    const csvData = purchaseOrders.flatMap(order => 
      order.purchase_order_items?.map(item => [
        order.order_number,
        order.supplier_name,
        order.contact_number || '',
        item.products?.name || '',
        item.quantity,
        item.unit_price,
        item.total_price,
        order.purchase_payment_methods?.type || '',
        order.warehouse_name || '',
        order.status,
        format(new Date(order.order_date), 'MMM dd, yyyy'),
        format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')
      ]) || [[
        order.order_number,
        order.supplier_name,
        order.contact_number || '',
        '',
        '',
        '',
        order.total_amount,
        order.purchase_payment_methods?.type || '',
        order.warehouse_name || '',
        order.status,
        format(new Date(order.order_date), 'MMM dd, yyyy'),
        format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')
      ]]
    );

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
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
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "PENDING":
        return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
      case "CANCELLED":
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🛒 Purchase Order Management</h1>
          <p className="text-gray-600 mt-1">Manage inventory purchases and supplier orders</p>
        </div>
        <div className="flex gap-2">
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

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input 
                placeholder="Search by order number or supplier name..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading purchase orders...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Order #</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Supplier</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Contact</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Qty</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Total</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Payment Method</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Warehouse</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders?.map((order) => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-sm">{order.order_number}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{order.supplier_name}</div>
                        {order.description && (
                          <div className="text-sm text-gray-500 max-w-[200px] truncate">
                            {order.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">{order.contact_number || '-'}</td>
                      <td className="py-3 px-4">
                        {order.purchase_order_items && order.purchase_order_items.length > 0 ? (
                          <div>
                            <div className="font-medium">{order.purchase_order_items[0].products?.name}</div>
                            {order.purchase_order_items.length > 1 && (
                              <div className="text-xs text-gray-500">+{order.purchase_order_items.length - 1} more</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {order.purchase_order_items?.[0]?.quantity || '-'}
                      </td>
                      <td className="py-3 px-4">
                        ₹{order.purchase_order_items?.[0]?.unit_price || 0}
                      </td>
                      <td className="py-3 px-4 font-medium">₹{order.total_amount}</td>
                      <td className="py-3 px-4">
                        {order.purchase_payment_methods?.type || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {order.warehouse_name || '-'}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                      <td className="py-3 px-4">{format(new Date(order.order_date), 'MMM dd, yyyy')}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm">
                            View Details
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {purchaseOrders?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No purchase orders found. Create your first purchase order to get started.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Purchase Order Dialog */}
      <EnhancedPurchaseOrderDialog 
        open={showPurchaseOrderDialog} 
        onOpenChange={setShowPurchaseOrderDialog}
      />
    </div>
  );
}
