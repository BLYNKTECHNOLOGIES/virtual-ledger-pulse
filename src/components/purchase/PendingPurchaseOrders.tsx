import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PurchaseOrderCard } from "./PurchaseOrderCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/sales/FileUpload";
import { validateBankAccountBalance, ValidationError } from "@/utils/validations";

interface PaymentMethodOption {
  id: string;
  type: string;
  bank_account_name?: string;
  upi_id?: string;
  bank_account_id?: string;
}

export function PendingPurchaseOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [actionType, setActionType] = useState<'complete' | 'review' | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");
  const [paymentProofUrls, setPaymentProofUrls] = useState<string[]>([]);
  const [failureReason, setFailureReason] = useState("");

  // Optimized query with stale time
  const { data: orders, isLoading } = useQuery({
    queryKey: ['purchase_orders', 'pending'],
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
          purchase_payment_method:purchase_payment_method_id (
            id,
            type,
            bank_account_name,
            min_limit,
            max_limit,
            payment_limit,
            current_usage
          )
        `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    staleTime: 30000, // 30 seconds
  });

  // Memoized payment methods query
  const { data: paymentMethods } = useQuery({
    queryKey: ['purchase_payment_methods', selectedOrder?.payment_method_type],
    queryFn: async () => {
      if (!selectedOrder?.payment_method_type) return [];
      
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select(`
          id,
          type,
          bank_account_name
        `)
        .eq('is_active', true);
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrder?.payment_method_type && actionType === 'complete',
    staleTime: 300000, // 5 minutes
  });

  // Optimized mutations with better error handling and validation
  const completeOrderMutation = useMutation({
    mutationFn: async ({ orderId, paymentMethodId, proofUrls }: { orderId: string; paymentMethodId: string; proofUrls: string[] }) => {
      const selectedMethod = paymentMethods?.find(pm => pm.id === paymentMethodId);
      if (!selectedMethod) throw new Error('Payment method not found');

      const order = orders?.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

      // Use net_payable_amount when TDS is applied, otherwise use total_amount
      const amountToDeduct = order.tds_applied && order.net_payable_amount 
        ? order.net_payable_amount 
        : order.total_amount;

      // Update order status first
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ 
          status: 'COMPLETED',
          payment_proof_url: proofUrls[0] || null,
          payment_method_used: selectedMethod.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (updateError) throw updateError;

      // Get order items with product details
      const { data: orderItems, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          products (code, name)
        `)
        .eq('purchase_order_id', orderId);

      if (itemsError) throw itemsError;

      // Process each item based on product type
      for (const item of orderItems || []) {
        const product = item.products;
        
        if (product?.code === 'USDT') {
          // For USDT, find an active USDT wallet and credit it
          const { data: usdtWallets, error: walletError } = await supabase
            .from('wallets')
            .select('*')
            .eq('wallet_type', 'USDT')
            .eq('is_active', true)
            .limit(1);

          if (walletError) throw walletError;

          if (usdtWallets && usdtWallets.length > 0) {
            const wallet = usdtWallets[0];
            
            // Credit the wallet
            const { error: transactionError } = await supabase
              .from('wallet_transactions')
              .insert({
                wallet_id: wallet.id,
                transaction_type: 'CREDIT',
                amount: item.quantity,
                reference_type: 'PURCHASE_ORDER',
                reference_id: orderId,
                description: `USDT purchased via purchase order ${order.order_number}`,
                balance_before: 0, // Will be updated by trigger
                balance_after: 0   // Will be updated by trigger
              });

            if (transactionError) throw transactionError;
          }
        } else {
          // For non-USDT products, create warehouse stock movements
          const { error: movementError } = await supabase
            .from('warehouse_stock_movements')
            .insert({
              product_id: item.product_id,
              warehouse_id: item.warehouse_id,
              movement_type: 'IN',
              quantity: item.quantity,
              reference_type: 'PURCHASE_ORDER',
              reference_id: orderId,
              reason: `Purchase Order - ${order.order_number}`
            });

          if (movementError) throw movementError;
        }
      }

      // Sync USDT stock with wallets
      const { error: syncError } = await supabase.rpc('sync_usdt_stock');
      if (syncError) {
        console.warn('USDT sync failed but order completed:', syncError);
      }

      // Update payment method current usage
      const { data: currentMethod, error: fetchMethodError } = await supabase
        .from('purchase_payment_methods')
        .select('current_usage')
        .eq('id', paymentMethodId)
        .single();

      if (fetchMethodError) throw fetchMethodError;

      const newUsage = (currentMethod.current_usage || 0) + amountToDeduct;

      const { error: updateMethodError } = await supabase
        .from('purchase_payment_methods')
        .update({ 
          current_usage: newUsage,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentMethodId);

      if (updateMethodError) throw updateMethodError;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Purchase order completed successfully, stock added to warehouse, bank balance adjusted, and payment method usage updated.",
      });
      // Optimistic updates
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_manual_only'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['products_with_warehouse_stock'] });
      queryClient.invalidateQueries({ queryKey: ['products_with_warehouse_stock_cards'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeDialog();
    },
    onError: (error: Error) => {
      const message = error instanceof ValidationError ? error.message : `Failed to complete order: ${error.message}`;
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const reviewNeededMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ 
          status: 'REVIEW_NEEDED',
          failure_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Order moved to review needed with failure reason.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update status: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Memoized handlers
  const handleUpdateStatus = useMemo(() => (orderId: string, status: string) => {
    const order = orders?.find(o => o.id === orderId);
    if (!order) return;

    setSelectedOrder(order);
    setActionType(status === 'COMPLETED' ? 'complete' : 'review');
  }, [orders]);

  const closeDialog = () => {
    setSelectedOrder(null);
    setActionType(null);
    setSelectedPaymentMethod("");
    setPaymentProofUrls([]);
    setFailureReason("");
  };

  const handleCompleteOrder = () => {
    if (!selectedOrder || !selectedPaymentMethod) return;
    
    completeOrderMutation.mutate({
      orderId: selectedOrder.id,
      paymentMethodId: selectedPaymentMethod,
      proofUrls: paymentProofUrls
    });
  };

  const handleReviewNeeded = () => {
    if (!selectedOrder || !failureReason.trim()) return;
    
    reviewNeededMutation.mutate({
      orderId: selectedOrder.id,
      reason: failureReason
    });
  };

  // Optimized loading skeleton
  const LoadingSkeleton = useMemo(() => (
    <div className="space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  ), []);

  if (isLoading) {
    return LoadingSkeleton;
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📋</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Orders</h3>
        <p className="text-gray-600">All purchase orders have been processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Pending Purchase Orders ({orders.length})</h2>
      </div>
      
      <div className="grid gap-4">
        {orders.map((order) => (
          <PurchaseOrderCard
            key={order.id}
            order={order}
            onUpdateStatus={handleUpdateStatus}
          />
        ))}
      </div>

      {/* Payment Completion Dialog */}
      <Dialog open={actionType === 'complete'} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete Payment - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800">Order Details</h4>
              <p className="text-sm text-blue-600">Supplier: {selectedOrder?.supplier_name}</p>
              <p className="text-sm text-blue-600">
                Total Amount: ₹{selectedOrder?.total_amount?.toFixed(2)}
              </p>
              {selectedOrder?.tds_applied && (
                <>
                  <p className="text-sm text-blue-600">TDS Amount: ₹{selectedOrder?.tds_amount?.toFixed(2)}</p>
                  <p className="text-sm font-medium text-blue-800">
                    Amount to Pay (After TDS): ₹{selectedOrder?.net_payable_amount?.toFixed(2)}
                  </p>
                </>
              )}
              {!selectedOrder?.tds_applied && (
                <p className="text-sm font-medium text-blue-800">
                  Amount to Pay: ₹{selectedOrder?.total_amount?.toFixed(2)}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="payment_method">Payment Method Used</Label>
              <Select onValueChange={setSelectedPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.type} - {method.bank_account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Payment Proof</Label>
              <FileUpload 
                onFilesUploaded={setPaymentProofUrls}
                existingFiles={paymentProofUrls}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button 
                onClick={handleCompleteOrder}
                disabled={!selectedPaymentMethod || completeOrderMutation.isPending}
              >
                {completeOrderMutation.isPending ? "Processing..." : "Complete Payment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Needed Dialog */}
      <Dialog open={actionType === 'review'} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark for Review - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-lg">
              <h4 className="font-medium text-red-800">Order Details</h4>
              <p className="text-sm text-red-600">Supplier: {selectedOrder?.supplier_name}</p>
              <p className="text-sm text-red-600">Amount: ₹{selectedOrder?.total_amount?.toFixed(2)}</p>
            </div>

            <div>
              <Label htmlFor="failure_reason">Reason for Payment Failure *</Label>
              <Textarea
                id="failure_reason"
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                placeholder="Describe why the payment failed..."
                className="mt-1"
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button 
                onClick={handleReviewNeeded}
                disabled={!failureReason.trim() || reviewNeededMutation.isPending}
                variant="destructive"
              >
                {reviewNeededMutation.isPending ? "Processing..." : "Mark for Review"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
