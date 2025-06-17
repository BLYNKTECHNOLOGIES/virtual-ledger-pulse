
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

interface PaymentMethodOption {
  id: string;
  type: string;
  bank_account_name?: string;
  upi_id?: string;
  bank_account_id?: string;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_name: string;
  total_amount: number;
  tds_applied: boolean;
  tds_amount?: number;
  net_payable_amount?: number;
  payment_method_type: string;
  bank_account_id?: string;
  bank_accounts?: {
    account_name: string;
    bank_name: string;
    id: string;
  };
}

export function PendingPurchaseOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
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
          bank_accounts!bank_account_id(account_name, bank_name, id)
        `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PurchaseOrder[];
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
          bank_account_name,
          bank_accounts!inner(id, account_name, account_number)
        `)
        .eq('is_active', true)
        .eq('type', selectedOrder.payment_method_type === 'UPI' ? 'UPI' : 'Bank Transfer');
      
      if (error) throw error;
      return data as PaymentMethodOption[];
    },
    enabled: !!selectedOrder?.payment_method_type && actionType === 'complete',
    staleTime: 300000, // 5 minutes
  });

  // Optimized mutations with better error handling
  const completeOrderMutation = useMutation({
    mutationFn: async ({ orderId, paymentMethodId, proofUrls }: { orderId: string; paymentMethodId: string; proofUrls: string[] }) => {
      const selectedMethod = paymentMethods?.find(pm => pm.id === paymentMethodId);
      if (!selectedMethod) throw new Error('Payment method not found');

      const order = orders?.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

      // Use net payable amount if TDS is applied, otherwise use total amount
      const amountToDeduct = order.tds_applied ? order.net_payable_amount : order.total_amount;

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

      // Only deduct from bank if bank account is specified
      if (order.bank_account_id && amountToDeduct) {
        const { data: accountData, error: fetchError } = await supabase
          .from('bank_accounts')
          .select('balance')
          .eq('id', order.bank_account_id)
          .single();
        
        if (fetchError) throw fetchError;

        const newBalance = accountData.balance - amountToDeduct;

        const { error: balanceError } = await supabase
          .from('bank_accounts')
          .update({ 
            balance: newBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.bank_account_id);
        
        if (balanceError) throw balanceError;

        const { error: transactionError } = await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: order.bank_account_id,
            transaction_type: 'EXPENSE',
            amount: amountToDeduct,
            description: `Purchase Order Payment - ${order.order_number}`,
            transaction_date: new Date().toISOString().split('T')[0],
            reference_number: order.order_number,
            category: 'Purchase',
            related_account_name: order.supplier_name
          });

        if (transactionError) throw transactionError;

        // Update payment method usage
        const { data: paymentMethodsData, error: pmError } = await supabase
          .from('purchase_payment_methods')
          .select('*')
          .eq('bank_account_id', order.bank_account_id)
          .eq('is_active', true);

        if (!pmError && paymentMethodsData && paymentMethodsData.length > 0) {
          const paymentMethod = paymentMethodsData[0];
          const { error: updateError } = await supabase
            .from('purchase_payment_methods')
            .update({ 
              current_usage: paymentMethod.current_usage + amountToDeduct,
              updated_at: new Date().toISOString()
            })
            .eq('id', paymentMethod.id);

          if (updateError) console.error('Error updating payment method usage:', updateError);
        }
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Purchase order completed successfully and payment processed.",
      });
      // Optimistic updates
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to complete order: ${error.message}`,
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
                Amount Paid: ₹{selectedOrder?.tds_applied ? selectedOrder?.net_payable_amount?.toFixed(2) : selectedOrder?.total_amount?.toFixed(2)}
              </p>
              {selectedOrder?.tds_applied && (
                <p className="text-sm text-blue-600">TDS Deducted: ₹{selectedOrder?.tds_amount?.toFixed(2)}</p>
              )}
              {selectedOrder?.bank_accounts && (
                <p className="text-sm text-blue-600">
                  Bank Account: {selectedOrder.bank_accounts.account_name} - {selectedOrder.bank_accounts.bank_name}
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
                      {method.type === 'UPI' 
                        ? `UPI - ${method.bank_account_name}` 
                        : `Bank Transfer - ${method.bank_accounts?.account_name} (${method.bank_accounts?.account_number})`
                      }
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
