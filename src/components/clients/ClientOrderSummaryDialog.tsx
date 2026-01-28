import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  ShoppingCart, 
  TrendingUp, 
  Calendar, 
  DollarSign,
  Package
} from "lucide-react";
import { format } from "date-fns";

interface ClientOrderSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
}

export function ClientOrderSummaryDialog({ 
  open, 
  onOpenChange, 
  clientId 
}: ClientOrderSummaryDialogProps) {
  // Fetch client details
  const { data: client } = useQuery({
    queryKey: ['client-details', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId && open,
  });

  // Fetch all purchase orders for this seller
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['client-purchase-orders', client?.name],
    queryFn: async () => {
      if (!client?.name) return [];
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('supplier_name', client.name)
        .order('order_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!client?.name && open,
  });

  // Calculate summary statistics
  const summary = {
    totalOrders: orders?.length || 0,
    totalValue: orders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0,
    firstOrder: orders && orders.length > 0 ? orders[orders.length - 1]?.order_date : null,
    lastOrder: orders && orders.length > 0 ? orders[0]?.order_date : null,
    averageValue: orders && orders.length > 0 
      ? (orders.reduce((sum, o) => sum + (o.total_amount || 0), 0) / orders.length) 
      : 0,
    completedOrders: orders?.filter(o => o.status === 'COMPLETED').length || 0,
    pendingOrders: orders?.filter(o => o.status === 'PENDING').length || 0,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'PENDING':
        return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Order Summary - {client?.name}
          </DialogTitle>
        </DialogHeader>

        {/* Client Info */}
        {client && (
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Client ID:</span>
                <p className="font-mono font-medium">{client.client_id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>
                <p className="font-medium">{client.phone || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>
                <p className="font-medium">{client.client_type || 'SELLER'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={client.kyc_status === 'VERIFIED' ? 'default' : 'secondary'}>
                  {client.kyc_status}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Total Orders</span>
              </div>
              <p className="text-2xl font-bold mt-1">{summary.totalOrders}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Total Value</span>
              </div>
              <p className="text-2xl font-bold mt-1">₹{summary.totalValue.toLocaleString()}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                <span className="text-sm text-muted-foreground">Avg. Value</span>
              </div>
              <p className="text-2xl font-bold mt-1">₹{summary.averageValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">First Order</span>
              </div>
              <p className="text-lg font-bold mt-1">
                {summary.firstOrder 
                  ? format(new Date(summary.firstOrder), 'dd MMM yyyy')
                  : '-'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <div className="border rounded-lg">
          <div className="p-3 border-b bg-muted/30">
            <h3 className="font-medium">Order History</h3>
          </div>
          
          {ordersLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading orders...
            </div>
          ) : orders && orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left py-2 px-4 font-medium text-gray-600 text-sm">Order #</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-600 text-sm">Date</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-600 text-sm">Description</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-600 text-sm">Amount</th>
                    <th className="text-center py-2 px-4 font-medium text-gray-600 text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4 font-mono text-sm">{order.order_number}</td>
                      <td className="py-2 px-4 text-sm">
                        {order.order_date 
                          ? format(new Date(order.order_date), 'dd MMM yyyy')
                          : '-'}
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-600 max-w-xs truncate">
                        {order.description || '-'}
                      </td>
                      <td className="py-2 px-4 text-sm text-right font-medium">
                        ₹{(order.total_amount || 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-center">
                        {getStatusBadge(order.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No orders found for this seller
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
