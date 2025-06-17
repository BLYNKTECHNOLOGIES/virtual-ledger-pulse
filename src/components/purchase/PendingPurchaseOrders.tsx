
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PurchaseOrderCard } from "./PurchaseOrderCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_name: string;
  total_amount: number;
  net_payable_amount?: number;
  tds_applied?: boolean;
  tds_amount?: number;
  status: string;
  order_date: string;
  assigned_to?: string;
  contact_number?: string;
}

interface PaymentData {
  bank_account_id: string;
  payment_proof_url?: string;
  notes?: string;
}

export function PendingPurchaseOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData>({
    bank_account_id: "",
    payment_proof_url: "",
    notes: ""
  });

  // Fetch pending purchase orders
  const { data: pendingOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', 'PENDING'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch bank accounts for payment
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('account_name');
      if (error) throw error;
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: "Purchase order status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update status: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const processPaymentMutation = useMutation({
    mutationFn: async ({ orderId, paymentInfo }: { orderId: string; paymentInfo: PaymentData }) => {
      const order = pendingOrders?.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

      // Get bank account details
      const { data: bankAccount } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', paymentInfo.bank_account_id)
        .single();

      if (!bankAccount) throw new Error('Bank account not found');

      // Calculate payment amount (use net payable if TDS applied, otherwise total amount)
      const paymentAmount = order.tds_applied ? 
        (order.net_payable_amount || order.total_amount) : 
        order.total_amount;

      // Check if sufficient balance
      if (bankAccount.balance < paymentAmount) {
        throw new Error(`Insufficient balance. Available: ₹${bankAccount.balance}, Required: ₹${paymentAmount}`);
      }

      // Update purchase order with payment details
      const { error: orderError } = await supabase
        .from('purchase_orders')
        .update({
          status: 'COMPLETED',
          bank_account_id: paymentInfo.bank_account_id,
          bank_account_name: bankAccount.account_name,
          payment_proof_url: paymentInfo.payment_proof_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // Create bank transaction record
      const { error: transactionError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: paymentInfo.bank_account_id,
          transaction_type: 'EXPENSE',
          amount: paymentAmount,
          description: `Purchase Order Payment - ${order.order_number}`,
          transaction_date: new Date().toISOString().split('T')[0],
          reference_number: order.order_number,
          category: 'Purchase Order'
        });

      if (transactionError) throw transactionError;

      // Update bank account balance
      const { error: balanceError } = await supabase
        .from('bank_accounts')
        .update({
          balance: bankAccount.balance - paymentAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentInfo.bank_account_id);

      if (balanceError) throw balanceError;

      return { orderId, paymentAmount };
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Processed",
        description: `Payment of ₹${data.paymentAmount.toFixed(2)} has been processed successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      setShowPaymentDialog(false);
      setSelectedOrder(null);
      setPaymentData({ bank_account_id: "", payment_proof_url: "", notes: "" });
    },
    onError: (error) => {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStatusUpdate = (orderId: string, status: string) => {
    updateStatusMutation.mutate({ orderId, status });
  };

  const handlePayOrder = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowPaymentDialog(true);
  };

  const handleProcessPayment = () => {
    if (!selectedOrder || !paymentData.bank_account_id) {
      toast({
        title: "Error",
        description: "Please select a bank account for payment.",
        variant: "destructive",
      });
      return;
    }

    processPaymentMutation.mutate({
      orderId: selectedOrder.id,
      paymentInfo: paymentData
    });
  };

  if (isLoading) {
    return <div>Loading pending orders...</div>;
  }

  if (!pendingOrders || pendingOrders.length === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Orders</h3>
        <p className="text-gray-500">All purchase orders have been processed.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pendingOrders.map((order) => (
          <div key={order.id} className="relative">
            <PurchaseOrderCard
              order={order}
              onUpdateStatus={handleStatusUpdate}
            />
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => handlePayOrder(order)}
                className="flex-1"
                size="sm"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Pay Order
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium">Order Details</h4>
                <p className="text-sm text-gray-600">Order: {selectedOrder.order_number}</p>
                <p className="text-sm text-gray-600">Supplier: {selectedOrder.supplier_name}</p>
                <div className="mt-2">
                  <p className="text-sm text-gray-600">Total Amount: ₹{selectedOrder.total_amount.toFixed(2)}</p>
                  {selectedOrder.tds_applied && (
                    <>
                      <p className="text-sm text-red-600">TDS Deducted: ₹{selectedOrder.tds_amount?.toFixed(2)}</p>
                      <p className="text-sm font-medium text-green-600">
                        Amount to Pay: ₹{selectedOrder.net_payable_amount?.toFixed(2)}
                      </p>
                    </>
                  )}
                  {!selectedOrder.tds_applied && (
                    <p className="text-sm font-medium">
                      Amount to Pay: ₹{selectedOrder.total_amount.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="bank_account">Bank Account *</Label>
                <Select 
                  value={paymentData.bank_account_id} 
                  onValueChange={(value) => setPaymentData(prev => ({ ...prev, bank_account_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.account_name} - {account.bank_name} (₹{account.balance.toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Payment Notes</Label>
                <Textarea
                  id="notes"
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional payment notes..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowPaymentDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleProcessPayment}
                  disabled={processPaymentMutation.isPending || !paymentData.bank_account_id}
                >
                  {processPaymentMutation.isPending ? "Processing..." : "Process Payment"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
