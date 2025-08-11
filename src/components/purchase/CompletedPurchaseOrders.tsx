
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { CheckCircle, Eye, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PurchaseOrderDetailsDialog } from "./PurchaseOrderDetailsDialog";
import { EditPurchaseOrderDialog } from "./EditPurchaseOrderDialog";

export function CompletedPurchaseOrders() {
  // Fetch completed purchase orders
  const { data: completedOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', 'COMPLETED'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_payment_method:purchase_payment_method_id(
            id,
            type,
            bank_account_name,
            upi_id,
            bank_accounts!purchase_payment_methods_bank_account_name_fkey(account_name)
          )
        `)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseMethods } = useQuery({
    queryKey: ['purchase_payment_methods_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select('id, type, bank_account_name, upi_id');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Purchase order deleted" });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete order", variant: "destructive" });
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
                  <TableHead>Actions</TableHead>
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
                        {(() => {
                          const rel = (order as any).purchase_payment_method;
                          if (rel) {
                            if (rel.type === 'BANK_TRANSFER') {
                              const acc = (rel as any).bank_accounts?.account_name || rel.bank_account_name;
                              return `Bank: ${acc || '-'}`;
                            }
                            if (rel.type === 'UPI') return `UPI: ${rel.upi_id || '-'}`;
                            return rel.type;
                          }
                          const methodId = order.purchase_payment_method_id || order.payment_method_used;
                          const method = (purchaseMethods || []).find((m: any) => m.id === methodId);
                          if (method) {
                            if (method.type === 'BANK_TRANSFER') return `Bank: ${method.bank_account_name || '-'}`;
                            if (method.type === 'UPI') return `UPI: ${method.upi_id || '-'}`;
                            return method.type;
                          }
                          if (order.payment_method_type === 'BANK_TRANSFER') return `Bank: ${order.bank_account_name || order.bank_account_number || '-'}`;
                          if (order.payment_method_type === 'UPI') return `UPI: ${order.upi_id || '-'}`;
                          return '-';
                        })()}
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
                    <TableCell>
                      <div className="flex items-center gap-1">
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
                          onClick={() => { if (confirm('Delete this purchase order?')) deleteMutation.mutate(order.id); }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PurchaseOrderDetailsDialog
        open={!!selectedOrderForDetails}
        onOpenChange={() => setSelectedOrderForDetails(null)}
        order={selectedOrderForDetails}
      />
      <EditPurchaseOrderDialog
        open={!!selectedOrderForEdit}
        onOpenChange={() => setSelectedOrderForEdit(null)}
        order={selectedOrderForEdit}
      />
    </div>
  );
}
