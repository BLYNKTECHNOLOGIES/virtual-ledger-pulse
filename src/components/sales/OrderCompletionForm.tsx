import { useState, useEffect } from "react";
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
    price: 0,
    warehouseId: '',
    description: '',
    platform: ''
  });

  // Sync form data when dialog opens with a new order
  useEffect(() => {
    if (open && order) {
      setFormData({
        stockName: '',
        quantity: 1,
        price: order.price_per_unit || order.total_amount || 0,
        warehouseId: '',
        description: `Sales order completion for ${order.client_name || ''}`,
        platform: order.platform || ''
      });
    }
  }, [open, order?.id]);

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      // Stock syncing is handled by database triggers automatically
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

      // Validate stock before completing order
      if (selectedProduct && formData.quantity) {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('name, current_stock_quantity')
          .eq('id', selectedProduct.id)
          .single();

        if (productError) throw productError;

        if (!product) {
          throw new Error('Product not found');
        }

        if (product.current_stock_quantity < formData.quantity) {
          throw new Error(
            `Insufficient stock. Available: ${product.current_stock_quantity}, Required: ${formData.quantity} for product: ${product.name}`
          );
        }
      }

      // Validate wallet balance for USDT transactions
      if (walletId && usdtAmount > 0) {
        const { data: wallet, error: walletError } = await supabase
          .from('wallets')
          .select('current_balance, wallet_name')
          .eq('id', walletId)
          .single();

        if (walletError) throw walletError;

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        if (wallet.current_balance < usdtAmount) {
          throw new Error(
            `Insufficient wallet balance. Available: ${wallet.current_balance}, Required: ${usdtAmount} in wallet: ${wallet.wallet_name}`
          );
        }
      }

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

      // Process wallet deduction if wallet and amount are specified
      if (walletId && usdtAmount > 0) {
        // Determine asset code from the selected product
        const assetCode = selectedProduct?.code || 'USDT';
        
        // Deduct only the quantity sold (not including fees)
        const { error: walletDeductError } = await supabase.rpc(
          'process_sales_order_wallet_deduction',
          {
            sales_order_id: order.id,
            wallet_id: walletId,
            usdt_amount: usdtAmount,
            p_asset_code: assetCode
          }
        );

        if (walletDeductError) {
          throw new Error(`Wallet deduction failed: ${walletDeductError.message}`);
        }
        
        // Process platform fee separately if applicable
        const platformFees = order?.fee_amount || 0;
        if (platformFees > 0) {
          console.log('💰 Processing platform fee deduction:', platformFees, 'USDT');
          
          const { data: feeResult, error: feeError } = await supabase.rpc('process_platform_fee_deduction', {
            p_order_id: order.id,
            p_order_type: 'SALES_ORDER',
            p_wallet_id: walletId,
            p_fee_amount: platformFees,
            p_order_number: order.order_number
          });
          
          if (feeError) {
            console.error('Error processing platform fee:', feeError);
            // Don't throw - main order was completed, just log
          } else {
            console.log('✅ Platform fee processed:', feeResult);
          }
        }
      }

      // Note: Stock transactions and product updates will be handled by database triggers
      console.log('✅ Order completion - all stock management handled by database triggers');

      // Process bank transaction if payment method exists
      if (order.sales_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id')
          .eq('id', order.sales_payment_method_id)
          .single();

        // Note: Bank transaction will be automatically created by database triggers
        if (paymentMethod?.bank_account_id) {
          console.log('Order completed for payment method with bank account - bank transaction will be handled by triggers');
        }
      }

      return order.id;
    },
     onSuccess: async () => {
      toast({ 
        title: "Order Completed", 
        description: "Sales order completed successfully with wallet deduction and stock updates" 
      });
       
       // Check if client exists - if not, create an onboarding approval request for new buyers
       try {
         const clientName = order?.client_name;
         const clientPhone = order?.client_phone;
         
         if (clientName) {
           const { data: existingClient } = await supabase
             .from('clients')
             .select('id, name')
             .ilike('name', clientName.trim())
             .eq('is_deleted', false)
             .limit(1)
             .maybeSingle();
           
           // If client doesn't exist, create an onboarding approval request
           if (!existingClient) {
             console.log('📝 New client detected, creating onboarding approval request...');
             const { error: approvalError } = await supabase
               .from('client_onboarding_approvals')
               .insert({
                 sales_order_id: order.id,
                 client_name: clientName,
                 client_phone: clientPhone || null,
                 order_amount: order.total_amount || 0,
                 order_date: new Date().toISOString().split('T')[0],
                 approval_status: 'PENDING'
               });
 
             if (approvalError) {
               console.error('⚠️ Failed to create approval request:', approvalError);
             } else {
               console.log('✅ Onboarding approval request created');
             }
           } else {
             console.log('✅ Existing client found:', existingClient.name);
           }
         }
       } catch (approvalCheckError) {
         console.error('Error checking for existing client:', approvalCheckError);
       }
       
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
       queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
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
                    <div>Balance: {selectedWallet.current_balance?.toLocaleString()} USDT</div>
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
                      {wallet.wallet_name}
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