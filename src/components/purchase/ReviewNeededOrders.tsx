
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

export function ReviewNeededOrders({ searchTerm, dateFrom, dateTo }: { searchTerm?: string; dateFrom?: Date; dateTo?: Date }) {
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
        .select(`
          *,
          wallet:wallets!wallet_id(id, wallet_name),
          purchase_order_items (
            id,
            warehouse_id,
            products (name, code)
          ),
          created_by_user:users!created_by(username, first_name, last_name)
        `)
        .eq('status', 'REVIEW_NEEDED')
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

  const filteredOrders = (reviewOrders || []).filter((order: any) => {
    const matchesSearch = !searchTerm || (
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
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
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Orders Under Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!filteredOrders || filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders under review.
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
                      {order.failure_reason && (
                        <div className="text-sm text-red-500 max-w-[200px] truncate">
                          {order.failure_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        // If is_off_market is true, show "Off Market"
                        if (order.is_off_market) {
                          return 'Off Market';
                        }
                        // First try direct wallet relationship
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
                      })()}
                    </TableCell>
                    <TableCell className="font-medium">₹{order.total_amount?.toLocaleString()}</TableCell>
                    <TableCell>{order.quantity || 1}</TableCell>
                    <TableCell>₹{Number(order.price_per_unit || order.total_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className="bg-orange-100 text-orange-800">Review Needed</Badge>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOrder(order)}
                        className="bg-orange-50 hover:bg-orange-100 text-orange-700"
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
