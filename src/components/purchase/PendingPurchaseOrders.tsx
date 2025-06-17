
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CheckCircle, XCircle, Edit, Upload } from "lucide-react";

export function PendingPurchaseOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");

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

  // Fetch BAMS purchase payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data;
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, updateData }: any) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status, ...updateData })
        .eq('id', orderId);

      if (error) throw error;

      // If payment completed, update bank balance
      if (status === 'COMPLETED' && selectedPaymentMethod) {
        const paymentMethod = paymentMethods?.find(pm => pm.id === selectedPaymentMethod);
        if (paymentMethod?.bank_account_name) {
          const { data: bankAccount } = await supabase
            .from('bank_accounts')
            .select('balance')
            .eq('account_name', paymentMethod.bank_account_name)
            .single();

          if (bankAccount) {
            await supabase
              .from('bank_accounts')
              .update({ 
                balance: bankAccount.balance - selectedOrder.total_amount 
              })
              .eq('account_name', paymentMethod.bank_account_name);
          }
        }
      }
    },
    onSuccess: () => {
      toast({
        title: "Order Updated",
        description: "Purchase order status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      setSelectedOrder(null);
      setPaymentStatus("");
      setFailureReason("");
      setPaymentProof(null);
      setSelectedPaymentMethod("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update order: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleStatusUpdate = () => {
    if (!selectedOrder || !paymentStatus) return;

    const updateData: any = {};

    if (paymentStatus === "COMPLETED") {
      updateData.payment_method_used = selectedPaymentMethod;
      updateData.payment_proof_url = paymentProof ? "uploaded" : null; // In real app, upload to storage
    } else if (paymentStatus === "FAILED") {
      updateData.failure_reason = failureReason;
      updateData.failure_proof_url = paymentProof ? "uploaded" : null; // In real app, upload to storage
      updateData.status = "REVIEW_NEEDED";
    }

    updateOrderStatusMutation.mutate({
      orderId: selectedOrder.id,
      status: paymentStatus === "FAILED" ? "REVIEW_NEEDED" : paymentStatus,
      updateData
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Loading pending orders...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pending Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {!pendingOrders || pendingOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No pending purchase orders found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                    <TableCell>{order.supplier_name}</TableCell>
                    <TableCell>{order.contact_number || '-'}</TableCell>
                    <TableCell>₹{order.total_amount?.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {order.payment_method_type === 'UPI' ? `UPI: ${order.upi_id || '-'}` : 
                         order.payment_method_type === 'BANK_TRANSFER' ? `Bank: ${order.bank_account_number || '-'}` : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.assigned_to || '-'}</TableCell>
                    <TableCell>{format(new Date(order.order_date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Update Payment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment Status Update Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Payment Status</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Order: {selectedOrder?.order_number}</Label>
              <p className="text-sm text-gray-600">Amount: ₹{selectedOrder?.total_amount?.toLocaleString()}</p>
            </div>

            <div>
              <Label htmlFor="payment_status">Payment Status</Label>
              <Select onValueChange={setPaymentStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">Payment Completed</SelectItem>
                  <SelectItem value="FAILED">Payment Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentStatus === "COMPLETED" && (
              <>
                <div>
                  <Label htmlFor="payment_method">Payment Method Used</Label>
                  <Select onValueChange={setSelectedPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods?.filter(pm => 
                        (selectedOrder?.payment_method_type === 'UPI' && pm.type === 'UPI') ||
                        (selectedOrder?.payment_method_type === 'BANK_TRANSFER' && pm.type === 'Bank Transfer')
                      ).map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.bank_account_name || method.type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="payment_proof">Payment Proof</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                  />
                </div>
              </>
            )}

            {paymentStatus === "FAILED" && (
              <>
                <div>
                  <Label htmlFor="failure_reason">Failure Reason</Label>
                  <Textarea
                    id="failure_reason"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    placeholder="Describe the reason for payment failure..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="failure_proof">Failure Proof (Optional)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                Cancel
              </Button>
              <Button onClick={handleStatusUpdate} disabled={!paymentStatus}>
                Update Status
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
