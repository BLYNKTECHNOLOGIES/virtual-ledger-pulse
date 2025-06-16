
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Filter, Download, FileText, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PurchaseOrderDialog } from "@/components/purchase/PurchaseOrderDialog";

export default function Purchase() {
  const [showPurchaseOrderDialog, setShowPurchaseOrderDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch purchase orders from database
  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name)
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
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
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
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Bank Account</th>
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
                      <td className="py-3 px-4 font-medium">₹{order.total_amount}</td>
                      <td className="py-3 px-4">
                        {order.bank_accounts ? (
                          <div className="text-sm">
                            <div className="font-medium">{order.bank_accounts.account_name}</div>
                            <div className="text-gray-500">{order.bank_accounts.bank_name}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                      <td className="py-3 px-4">{format(new Date(order.order_date), 'MMM dd, yyyy')}</td>
                      <td className="py-3 px-4">
                        <Button variant="ghost" size="sm">
                          View Details
                        </Button>
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

      {/* Purchase Order Dialog */}
      <PurchaseOrderDialog 
        open={showPurchaseOrderDialog} 
        onOpenChange={setShowPurchaseOrderDialog}
      />
    </div>
  );
}
