
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


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
  const [orderToDelete, setOrderToDelete] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      console.log("🗑️ Deleting purchase order", { orderId });
      const { data, error } = await supabase.rpc('delete_purchase_order_with_reversal', {
        order_id: orderId
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      console.log("🧾 delete_purchase_order_with_reversal result", result);
      
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete purchase order');
      }
      
      return result;
    },
    onMutate: async (orderId: string) => {
      toast({
        title: "Deleting…",
        description: "Reversing transactions and removing purchase order.",
      });

      await queryClient.cancelQueries({ queryKey: ['purchase_orders'] });
      const previous = queryClient.getQueryData<any[]>(['purchase_orders', 'COMPLETED']);

      // Optimistically remove from the completed list
      queryClient.setQueryData<any[]>(['purchase_orders', 'COMPLETED'], (old) =>
        (old || []).filter((o: any) => o.id !== orderId)
      );

      return { previous };
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
    onError: (error: any, orderId: string, context) => {
      // rollback optimistic update
      if (context?.previous) {
        queryClient.setQueryData(['purchase_orders', 'COMPLETED'], context.previous);
      }
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete purchase order", 
        variant: "destructive" 
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
    }
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
                    <TableCell>{(order as any).platform || 'Off Market'}</TableCell>
                    <TableCell className="font-medium">₹{order.total_amount?.toLocaleString()}</TableCell>
                    <TableCell>
                      {order.purchase_order_items?.reduce((total: number, item: any) => total + item.quantity, 0) || order.quantity || 0}
                    </TableCell>
                    <TableCell>
                      ₹{order.purchase_order_items?.[0]?.unit_price?.toLocaleString() || Number(order.price_per_unit || order.total_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">Completed</Badge>
                    </TableCell>
                    <TableCell>
                      {(order as any).created_by_user ? (
                        <span className="font-medium text-gray-700">
                          {(order as any).created_by_user.first_name || (order as any).created_by_user.username}
                        </span>
                      ) : <span className="text-gray-400">N/A</span>}
                    </TableCell>
                    <TableCell>{format(new Date(order.order_date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedOrderForDetails(order)}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
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
                          onClick={() => {
                            setOrderToDelete(order);
                            toast({
                              title: "Delete requested",
                              description: `Confirm deletion for order ${order.order_number}.`,
                            });
                          }}
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

      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium">{orderToDelete?.order_number}</span> and reverse related
              transactions (bank, wallet, stock). Balances may go negative during reversal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!orderToDelete?.id) return;
                deleteMutation.mutate(orderToDelete.id);
                setOrderToDelete(null);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
