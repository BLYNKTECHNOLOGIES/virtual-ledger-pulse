
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
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
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
          wallet:wallets!wallet_id(id, wallet_name),
          purchase_order_items (
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            warehouse_id,
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

  // Fetch wallets for mapping wallet_id to wallet_name
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
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

  // Helper to get wallet name
  const getWalletName = (order: any) => {
    // If is_off_market is true, show "Off Market"
    if (order.is_off_market) {
      return 'Off Market';
    }
    // First try direct wallet relationship, then fallback to items
    if (order.wallet?.wallet_name) {
      return order.wallet.wallet_name;
    }
    // Fallback to purchase_order_items warehouse_id
    const warehouseId = order.purchase_order_items?.[0]?.warehouse_id;
    if (warehouseId) {
      const wallet = wallets?.find(w => w.id === warehouseId);
      return wallet?.wallet_name || '-';
    }
    return '-';
  };

  // Mobile card view
  const renderMobileCard = (order: any) => (
    <Card key={order.id} className="mb-3">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-mono text-sm font-medium">{order.order_number}</p>
            <p className="font-semibold text-lg">{order.supplier_name}</p>
          </div>
          <Badge className="bg-green-100 text-green-800">Completed</Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <span className="text-gray-500">Amount:</span>
            <p className="font-medium">₹{order.total_amount?.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-500">Quantity:</span>
            <p className="font-medium">{order.purchase_order_items?.reduce((total: number, item: any) => total + item.quantity, 0) || 0}</p>
          </div>
          <div>
            <span className="text-gray-500">Platform:</span>
            <p className="font-medium">{getWalletName(order)}</p>
          </div>
          <div>
            <span className="text-gray-500">Date:</span>
            <p className="font-medium">
              {format(new Date(order.order_date), 'MMM dd')}{' '}
              <span className="text-xs text-muted-foreground">
                {format(new Date(order.created_at || order.order_date), 'HH:mm')}
              </span>
            </p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Created By:</span>
            <p className="font-medium">
              {(order as any).created_by_user 
                ? ((order as any).created_by_user.first_name || (order as any).created_by_user.username)
                : <span className="text-muted-foreground">N/A</span>}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2 border-t flex-wrap">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setSelectedOrderForDetails(order)}
            className="text-blue-600 flex-1"
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          <Button 
            variant="ghost"
            size="sm"
            onClick={() => setSelectedOrderForEdit(order)}
            className="text-green-600 flex-1"
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOrderToDelete(order)}
            disabled={deleteMutation.isPending}
            className="text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Completed Purchase Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0">
          {!filteredOrders || filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No completed orders found.
            </div>
          ) : (
            <>
              {/* Mobile view - cards */}
              <div className="md:hidden">
                {filteredOrders.map((order) => renderMobileCard(order))}
              </div>
              
              {/* Desktop view - table */}
              <div className="hidden md:block overflow-x-auto">
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
                        <TableCell>{getWalletName(order)}</TableCell>
                        <TableCell className="font-medium">₹{order.total_amount?.toLocaleString()}</TableCell>
                        <TableCell>
                          {formatSmartDecimal(order.purchase_order_items?.reduce((total: number, item: any) => total + item.quantity, 0) || order.quantity || 0)}
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
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{format(new Date(order.order_date), 'MMM dd, yyyy')}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(order.created_at || order.order_date), 'HH:mm:ss')}
                            </span>
                          </div>
                        </TableCell>
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
              </div>
            </>
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
