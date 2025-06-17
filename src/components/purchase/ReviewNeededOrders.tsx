
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AlertTriangle, RefreshCw, XCircle } from "lucide-react";

export function ReviewNeededOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState("");
  const [alternativePaymentMethod, setAlternativePaymentMethod] = useState("");
  const [newUpiId, setNewUpiId] = useState("");
  const [newBankAccount, setNewBankAccount] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newIfscCode, setNewIfscCode] = useState("");

  // Fetch review needed orders
  const { data: reviewOrders, isLoading } = useQuery({
    queryKey: ['purchase_orders', 'REVIEW_NEEDED'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('status', 'REVIEW_NEEDED')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const handleReviewMutation = useMutation({
    mutationFn: async ({ orderId, action, updateData }: any) => {
      if (action === "CANCEL") {
        // Delete the order completely
        const { error } = await supabase
          .from('purchase_orders')
          .delete()
          .eq('id', orderId);
        
        if (error) throw error;
      } else if (action === "ALTERNATIVE_PAYMENT") {
        // Update with new payment method and move to pending
        const { error } = await supabase
          .from('purchase_orders')
          .update({
            status: 'PENDING',
            payment_method_type: alternativePaymentMethod,
            upi_id: alternativePaymentMethod === 'UPI' ? newUpiId : null,
            bank_account_number: alternativePaymentMethod === 'BANK_TRANSFER' ? newBankAccount : null,
            bank_account_name: alternativePaymentMethod === 'BANK_TRANSFER' ? newBankName : null,
            ifsc_code: alternativePaymentMethod === 'BANK_TRANSFER' ? newIfscCode : null,
            failure_reason: null,
            failure_proof_url: null
          })
          .eq('id', orderId);

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.action === "CANCEL" ? "Order Cancelled" : "Alternative Payment Added",
        description: variables.action === "CANCEL" 
          ? "Purchase order has been cancelled and removed." 
          : "Order moved back to pending with new payment method.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      setSelectedOrder(null);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to process review: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setReviewAction("");
    setAlternativePaymentMethod("");
    setNewUpiId("");
    setNewBankAccount("");
    setNewBankName("");
    setNewIfscCode("");
  };

  const handleReviewSubmit = () => {
    if (!selectedOrder || !reviewAction) return;

    handleReviewMutation.mutate({
      orderId: selectedOrder.id,
      action: reviewAction,
      updateData: {}
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Loading orders under review...
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
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Orders Under Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!reviewOrders || reviewOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders under review.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Failed Payment Method</TableHead>
                  <TableHead>Failure Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                    <TableCell>{order.supplier_name}</TableCell>
                    <TableCell>₹{order.total_amount?.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {order.payment_method_type === 'UPI' ? `UPI: ${order.upi_id}` : 
                         order.payment_method_type === 'BANK_TRANSFER' ? `Bank: ${order.bank_account_number}` : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{order.failure_reason || '-'}</TableCell>
                    <TableCell>{format(new Date(order.order_date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOrder(order)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Order: {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-lg">
              <h4 className="font-medium text-red-800">Failure Details</h4>
              <p className="text-sm text-red-600 mt-1">{selectedOrder?.failure_reason}</p>
            </div>

            <div>
              <Label htmlFor="review_action">Review Action</Label>
              <Select onValueChange={setReviewAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALTERNATIVE_PAYMENT">Provide Alternative Payment Method</SelectItem>
                  <SelectItem value="CANCEL">Cancel Order</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reviewAction === "ALTERNATIVE_PAYMENT" && (
              <div className="space-y-4 border rounded-lg p-4">
                <Label className="text-lg font-semibold">New Payment Method</Label>
                
                <div>
                  <Label htmlFor="alt_payment_type">Payment Method Type</Label>
                  <Select onValueChange={setAlternativePaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {alternativePaymentMethod === "UPI" && (
                  <div>
                    <Label htmlFor="new_upi_id">UPI ID</Label>
                    <Input
                      id="new_upi_id"
                      value={newUpiId}
                      onChange={(e) => setNewUpiId(e.target.value)}
                      placeholder="Enter UPI ID"
                    />
                  </div>
                )}

                {alternativePaymentMethod === "BANK_TRANSFER" && (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="new_bank_account">Bank Account Number</Label>
                      <Input
                        id="new_bank_account"
                        value={newBankAccount}
                        onChange={(e) => setNewBankAccount(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new_bank_name">Account Holder Name</Label>
                      <Input
                        id="new_bank_name"
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new_ifsc_code">IFSC Code</Label>
                      <Input
                        id="new_ifsc_code"
                        value={newIfscCode}
                        onChange={(e) => setNewIfscCode(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                Cancel
              </Button>
              <Button 
                onClick={handleReviewSubmit} 
                disabled={!reviewAction}
                variant={reviewAction === "CANCEL" ? "destructive" : "default"}
              >
                {reviewAction === "CANCEL" ? (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Order
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Send to Pending
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
