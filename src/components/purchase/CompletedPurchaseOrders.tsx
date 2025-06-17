
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { CheckCircle } from "lucide-react";

export function CompletedPurchaseOrders() {
  // Fetch completed purchase orders
  const { data: completedOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', 'COMPLETED'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Loading completed orders...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Completed Purchase Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!completedOrders || completedOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No completed orders found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method Used</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Completed Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                    <TableCell>
                      <div className="font-medium">{order.supplier_name}</div>
                      {order.description && (
                        <div className="text-sm text-gray-500 max-w-[200px] truncate">
                          {order.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{order.contact_number || '-'}</TableCell>
                    <TableCell className="font-medium">₹{order.total_amount?.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {order.payment_method_type === 'UPI' ? `UPI: ${order.upi_id || '-'}` : 
                         order.payment_method_type === 'BANK_TRANSFER' ? `Bank: ${order.bank_account_number || '-'}` : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.assigned_to || '-'}</TableCell>
                    <TableCell>{format(new Date(order.order_date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(new Date(order.updated_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Completed
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
