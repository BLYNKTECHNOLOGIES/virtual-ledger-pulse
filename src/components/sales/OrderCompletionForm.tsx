import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Wallet, Package, DollarSign } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OrderCompletionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function OrderCompletionForm({ open, onOpenChange, order }: OrderCompletionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    stockName: '',
    quantity: 1,
    price: order?.price_per_unit || order?.total_amount || 0,
    warehouseId: '',
    description: `Sales order completion for ${order?.client_name || ''}`,
    platform: order?.platform || ''
  });

  console.log('OrderCompletionForm opened with order:', order);

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      // Sync USDT stock with wallets to ensure accuracy
      await supabase.rpc('sync_usdt_stock');
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Remove warehouse functionality - using wallets only

  // Complete order mutation with wallet deduction
  const completeOrderMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get selected product and wallet
      const selectedProduct = products?.find(p => p.name === formData.stockName);
      const walletId = order?.wallet_id;
      const usdtAmount = order?.usdt_amount || order?.total_amount;

      // Update the sales order with completion details
      const { error: updateError } = await supabase
        .from('sales_orders')
        .update({
          product_id: selectedProduct?.id,
          warehouse_id: formData.warehouseId,
          quantity: formData.quantity,
          price_per_unit: formData.price,
          total_amount: formData.quantity * formData.price,
          description: formData.description,
          payment_status: 'COMPLETED',
          status: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // Process wallet deduction if wallet and USDT amount are specified
      if (walletId && usdtAmount > 0) {
        const { error: walletError } = await supabase.rpc(
          'process_sales_order_wallet_deduction',
          {
            sales_order_id: order.id,
            wallet_id: walletId,
            usdt_amount: usdtAmount
          }
        );

        if (walletError) {
          throw new Error(`Wallet deduction failed: ${walletError.message}`);
        }
      }

      // Update product stock if product is selected
      if (selectedProduct) {
        const { error: stockError } = await supabase
          .from('products')
          .update({
            current_stock_quantity: selectedProduct.current_stock_quantity - formData.quantity,
            total_sales: (selectedProduct.total_sales || 0) + formData.quantity,
            average_selling_price: selectedProduct.total_sales > 0 
              ? ((selectedProduct.average_selling_price || 0) * selectedProduct.total_sales + formData.price * formData.quantity) / (selectedProduct.total_sales + formData.quantity)
              : formData.price
          })
          .eq('id', selectedProduct.id);

        if (stockError) {
          console.error('Error updating product stock:', stockError);
        }

        // Create stock transaction record
        const { error: stockTransactionError } = await supabase
          .from('stock_transactions')
          .insert({
            product_id: selectedProduct.id,
            transaction_type: 'SALE',
            quantity: -formData.quantity, // Negative for outgoing stock
            unit_price: formData.price,
            total_amount: formData.quantity * formData.price,
            transaction_date: new Date().toISOString().split('T')[0],
            supplier_customer_name: order.client_name,
            reference_number: order.order_number,
            reason: 'Sales Order Completion'
          });

        if (stockTransactionError) {
          console.error('Error creating stock transaction:', stockTransactionError);
        }
      }

      // Process bank transaction if payment method exists
      if (order.sales_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id')
          .eq('id', order.sales_payment_method_id)
          .single();

        if (paymentMethod?.bank_account_id) {
          const { error: bankTransactionError } = await supabase
            .from('bank_transactions')
            .insert({
              bank_account_id: paymentMethod.bank_account_id,
              amount: formData.quantity * formData.price,
              transaction_type: 'INCOME',
              transaction_date: new Date().toISOString().split('T')[0],
              description: `Sales income from order ${order.order_number} - ${order.client_name}`,
              reference_number: order.order_number,
              category: 'Sales Revenue'
            });

          if (bankTransactionError) {
            console.error('Error creating bank transaction:', bankTransactionError);
          }
        }
      }

      return order.id;
    },
    onSuccess: () => {
      toast({ 
        title: "Order Completed", 
        description: "Sales order completed successfully with wallet deduction and stock updates" 
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error completing order:', error);
      toast({ 
        title: "Error", 
        description: `Failed to complete order: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const selectedWallet = wallets?.find(w => w.id === order?.wallet_id);
  const totalAmount = formData.quantity * formData.price;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Complete Sales Order - {order?.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Client:</span>
                  <p>{order?.client_name}</p>
                </div>
                <div>
                  <span className="font-medium">Order #:</span>
                  <p className="font-mono">{order?.order_number}</p>
                </div>
                <div>
                  <span className="font-medium">Order Amount:</span>
                  <p>₹{order?.total_amount?.toLocaleString()}</p>
                </div>
                <div>
                  <span className="font-medium">USDT Amount:</span>
                  <p>{order?.usdt_amount || order?.total_amount} USDT</p>
                </div>
              </div>

              {selectedWallet && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-800">Wallet Details</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <div>Name: {selectedWallet.wallet_name}</div>
                    <div>Balance: {selectedWallet.current_balance?.toLocaleString()} {selectedWallet.wallet_type}</div>
                    <div>Address: {selectedWallet.wallet_address?.substring(0, 10)}...{selectedWallet.wallet_address?.substring(selectedWallet.wallet_address.length - 6)}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Completion Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Completion Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Stock/Product</Label>
                <Select value={formData.stockName} onValueChange={(value) => setFormData({...formData, stockName: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.name}>
                        <div className="flex flex-col">
                          <span>{product.name}</span>
                          <span className="text-xs text-gray-500">Stock: {product.current_stock_quantity} {product.unit_of_measurement}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 1})}
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label>Price per Unit</Label>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div>
                <Label>Warehouse</Label>
                <Select value={formData.warehouseId} onValueChange={(value) => setFormData({...formData, warehouseId: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                  {wallets?.filter(w => w.is_active).map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} ({wallet.wallet_type})
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Order completion notes"
                />
              </div>

              <div className="p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800">Final Amount</span>
                </div>
                <div className="text-lg font-bold text-green-800">
                  ₹{totalAmount.toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => completeOrderMutation.mutate()}
            disabled={completeOrderMutation.isPending || !formData.stockName}
            className="bg-green-600 hover:bg-green-700"
          >
            {completeOrderMutation.isPending ? 'Completing...' : 'Complete Order'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}