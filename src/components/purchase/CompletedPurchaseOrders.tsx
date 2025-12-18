
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
import { ClickableUser } from "@/components/ui/clickable-user";

export function CompletedPurchaseOrders({ searchTerm, dateFrom, dateTo }: { searchTerm?: string; dateFrom?: Date; dateTo?: Date }) {
  // Fetch completed purchase orders
  const { data: completedOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', 'COMPLETED'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            products (name, code)
          ),
          purchase_payment_method:purchase_payment_method_id(
            id,
            type,
            bank_account_name,
            upi_id,
            bank_accounts!purchase_payment_methods_bank_account_name_fkey(account_name)
          ),
          bank_account:bank_account_id(
            account_name,
            bank_name
          ),
          created_by_user:users!created_by(username, first_name, last_name)
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
      const { data, error } = await supabase.rpc('delete_purchase_order_with_reversal', {
        order_id: orderId
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete purchase order');
      }
      
      return result;
    },
    onSuccess: (data) => {
      toast({ 
        title: "Deleted Successfully", 
        description: data?.message || "Purchase order and all transactions have been reversed" 
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete purchase order", 
        variant: "destructive" 
      });
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

  const filteredOrders = (completedOrders || []).filter((order: any) => {
    const matchesSearch = !searchTerm || (
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.contact_number && String(order.contact_number).toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const od = order.order_date ? new Date(order.order_date) : null;
    const inFrom = !dateFrom || (od && od >= new Date(dateFrom));
    const inTo = !dateTo || (od && od <= new Date(dateTo));
    return matchesSearch && inFrom && inTo;
  });

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
          {!filteredOrders || filteredOrders.length === 0 ? (
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
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Payment Method Used</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Completed Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
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
                      {order.purchase_order_items?.reduce((total: number, item: any) => total + item.quantity, 0) || 0}
                    </TableCell>
                    <TableCell>
                      ₹{order.purchase_order_items?.[0]?.unit_price?.toLocaleString() || Number(order.total_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {order.purchase_order_items?.[0]?.products?.name || order.product_name || 'N/A'}
                      </div>
                      {order.purchase_order_items?.[0]?.products?.code && (
                        <div className="text-xs text-gray-500">Code: {order.purchase_order_items[0].products.code}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        BINANCE BLYNK
                      </Badge>
                    </TableCell>
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
                          const bankAcc = (order as any).bank_account;
                          if (bankAcc?.account_name) {
                            return `Bank: ${bankAcc.account_name}`;
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
                    <TableCell>
                      {(order as any).created_by_user ? (
                        <ClickableUser
                          userId={(order as any).created_by_user.id}
                          username={(order as any).created_by_user.username}
                          firstName={(order as any).created_by_user.first_name}
                          lastName={(order as any).created_by_user.last_name}
                          email={(order as any).created_by_user.email}
                          phone={(order as any).created_by_user.phone}
                          role={(order as any).created_by_user.role}
                          avatarUrl={(order as any).created_by_user.avatar_url}
                        />
                      ) : '-'}
                    </TableCell>
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
                          onClick={() => { 
                            if (confirm(
                              'Are you sure you want to delete this purchase order?\n\n' +
                              'This will permanently reverse ALL related transactions:\n' +
                              '• Bank transactions will be reversed\n' +
                              '• Stock quantities will be reduced\n' +
                              '• Wallet transactions will be reversed\n\n' +
                              'This action cannot be undone.'
                            )) {
                              deleteMutation.mutate(order.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-700"
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
