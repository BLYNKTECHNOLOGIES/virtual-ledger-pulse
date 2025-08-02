
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SalesEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalesEntryDialog({ open, onOpenChange }: SalesEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Generate unique order number
  const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ORD-${timestamp}-${random}`;
  };

  const [formData, setFormData] = useState({
    order_number: generateOrderNumber(),
    client_name: '',
    client_phone: '',
    product_id: '',
    wallet_id: '',
    platform: '',
    quantity: '',
    price_per_unit: '',
    total_amount: 0,
    sales_payment_method_id: '',
    payment_status: 'COMPLETED',
    order_date: new Date().toISOString().split('T')[0],
    order_time: new Date().toTimeString().slice(0, 5),
    description: ''
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });


  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(
            account_name,
            bank_name
          )
        `)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const createSalesOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: result, error } = await supabase
        .from('sales_orders')
        .insert([{
          order_number: data.order_number,
          client_name: data.client_name,
          client_phone: data.client_phone || null,
          product_id: data.product_id || null,
          wallet_id: data.wallet_id || null,
          platform: data.platform || null,
          quantity: data.quantity,
          price_per_unit: data.price_per_unit,
          total_amount: data.total_amount,
          sales_payment_method_id: data.sales_payment_method_id || null,
          payment_status: data.payment_status,
          order_date: `${data.order_date}T${data.order_time}:00.000Z`,
          description: data.description
        }])
        .select()
        .single();
      
      if (error) throw error;

      // Set settlement status and handle bank crediting based on payment method type
      if (data.sales_payment_method_id && data.payment_status === 'COMPLETED') {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id, payment_gateway, current_usage, payment_limit')
          .eq('id', data.sales_payment_method_id)
          .single();

        // Update settlement status based on payment method type
        const settlementStatus = paymentMethod?.payment_gateway ? 'PENDING' : 'DIRECT';
        
        await supabase
          .from('sales_orders')
          .update({ settlement_status: settlementStatus })
          .eq('id', result.id);

        // Update payment method usage if it's a payment gateway
        if (paymentMethod?.payment_gateway) {
          const newUsage = (paymentMethod.current_usage || 0) + data.total_amount;
          await supabase
            .from('sales_payment_methods')
            .update({ current_usage: newUsage })
            .eq('id', data.sales_payment_method_id);
        }

        // Only credit bank account if NOT a payment gateway
        if (paymentMethod?.bank_account_id && !paymentMethod?.payment_gateway) {
          // Create bank transaction for direct sales
          await supabase
            .from('bank_transactions')
            .insert({
              bank_account_id: paymentMethod.bank_account_id,
              transaction_type: 'INCOME',
              amount: data.total_amount,
              description: `Sales Order - ${data.order_number} - ${data.client_name}`,
              transaction_date: data.order_date,
              category: 'Sales',
              reference_number: data.order_number
             });
        }
      }

      // Process wallet deduction if wallet is selected and payment is completed
      if (data.wallet_id && data.payment_status === 'COMPLETED') {
        // Use the function to process wallet deduction which will also sync USDT stock
        const { error: walletError } = await supabase.rpc('process_sales_order_wallet_deduction', {
          sales_order_id: result.id,
          wallet_id: data.wallet_id,
          usdt_amount: parseFloat(data.quantity)
        });

        if (walletError) {
          console.error('Error processing wallet deduction:', walletError);
          throw new Error(`Wallet deduction failed: ${walletError.message}`);
        }
      }

      return result;
    },
    onSuccess: () => {
      console.log('🎉 Sales order created successfully - onSuccess callback triggered');
      console.log('🔄 Calling onOpenChange(false) to close dialog');
      toast({ title: "Success", description: "Sales order created successfully" });
      onOpenChange(false); // Close the dialog immediately
      console.log('✅ Dialog should be closed now');
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      // Force a full page refresh to ensure all components show updated data
      setTimeout(() => window.location.reload(), 1000);
      setFormData({
        order_number: generateOrderNumber(),
        client_name: '',
        client_phone: '',
        product_id: '',
        wallet_id: '',
        platform: '',
        quantity: '',
        price_per_unit: '',
        total_amount: 0,
        sales_payment_method_id: '',
        payment_status: 'COMPLETED',
        order_date: new Date().toISOString().split('T')[0],
        order_time: new Date().toTimeString().slice(0, 5),
        description: ''
      });
    },
    onError: (error) => {
      console.error('❌ Error creating sales order:', error);
      console.log('🚫 onError callback triggered - dialog will NOT close automatically');
      toast({ title: "Error", description: "Failed to create sales order", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 Starting sales order creation mutation with data:', formData);
    
    // Manual validation for required fields
    if (!formData.order_number.trim()) {
      console.log('❌ Validation failed: Order number is required');
      toast({ title: "Validation Error", description: "Order number is required", variant: "destructive" });
      return;
    }
    
    if (!formData.client_name.trim()) {
      console.log('❌ Validation failed: Customer name is required');
      toast({ title: "Validation Error", description: "Customer name is required", variant: "destructive" });
      return;
    }
    
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      console.log('❌ Validation failed: Valid quantity is required');
      toast({ title: "Validation Error", description: "Valid quantity is required", variant: "destructive" });
      return;
    }
    
    if (!formData.price_per_unit || parseFloat(formData.price_per_unit) <= 0) {
      console.log('❌ Validation failed: Valid price per unit is required');
      toast({ title: "Validation Error", description: "Valid price per unit is required", variant: "destructive" });
      return;
    }
    
    console.log('✅ Validation passed, calling mutation');
    createSalesOrderMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-populate platform when wallet is selected
      if (field === 'wallet_id' && value && wallets) {
        const selectedWallet = wallets.find(w => w.id === value);
        if (selectedWallet) {
          // Extract platform name from wallet name (e.g., "BINANCE SS" -> "BINANCE")
          const platformName = selectedWallet.wallet_name.split(' ')[0];
          updated.platform = platformName;
        }
      }
      
      // Auto-calculate based on what's available
      if (field === 'quantity' || field === 'price_per_unit' || field === 'total_amount') {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(updated.quantity) || 0;
        const price = field === 'price_per_unit' ? parseFloat(value) || 0 : parseFloat(updated.price_per_unit) || 0;
        const total = field === 'total_amount' ? parseFloat(value) || 0 : updated.total_amount;
        
        if (field === 'quantity' && price > 0) {
          updated.total_amount = qty * price;
        } else if (field === 'price_per_unit' && qty > 0) {
          updated.total_amount = qty * price;
        } else if (field === 'total_amount') {
          if (qty > 0 && total > 0) {
            updated.price_per_unit = (total / qty).toFixed(2);
          } else if (price > 0 && total > 0) {
            updated.quantity = (total / price).toFixed(2);
          }
        }
      }
      
      return updated;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Sales Order</DialogTitle>
        </DialogHeader>

        <form 
          onSubmit={(e) => {
            console.log('🔥 FORM SUBMIT EVENT TRIGGERED!');
            handleSubmit(e);
          }} 
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Order Number *</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => handleInputChange('order_number', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Customer Name *</Label>
              <Input
                value={formData.client_name}
                onChange={(e) => handleInputChange('client_name', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Customer Phone</Label>
              <Input
                value={formData.client_phone}
                onChange={(e) => handleInputChange('client_phone', e.target.value)}
              />
            </div>


            <div>
              <Label>Product</Label>
              <Select
                value={formData.product_id}
                onValueChange={(value) => handleInputChange('product_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - {product.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            <div>
              <Label>Wallet</Label>
              <Select
                value={formData.wallet_id}
                onValueChange={(value) => handleInputChange('wallet_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-200 shadow-lg z-50">
                  {wallets?.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} ({wallet.wallet_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', e.target.value)}
                required
                min="0"
                step="0.01"
                placeholder="Enter quantity"
              />
            </div>

            <div>
              <Label>Price Per Unit *</Label>
              <Input
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', e.target.value)}
                required
                min="0"
                step="0.01"
                placeholder="Enter price per unit"
              />
            </div>

            <div>
              <Label>Total Amount</Label>
              <Input
                type="number"
                value={formData.total_amount}
                disabled
                className="bg-gray-100"
              />
            </div>

            <div>
              <Label>Payment Method</Label>
              <Select
                value={formData.sales_payment_method_id}
                onValueChange={(value) => handleInputChange('sales_payment_method_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-200 shadow-lg z-50">
                  {paymentMethods?.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.bank_accounts ? method.bank_accounts.account_name : method.type} {method.payment_gateway ? '(Gateway)' : '(Direct)'} - ₹{method.current_usage?.toLocaleString()}/{method.payment_limit?.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Payment Status</Label>
              <Select
                value={formData.payment_status}
                onValueChange={(value) => handleInputChange('payment_status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Order Date</Label>
              <Input
                type="date"
                value={formData.order_date}
                onChange={(e) => handleInputChange('order_date', e.target.value)}
              />
            </div>

            <div>
              <Label>Order Time</Label>
              <Input
                type="time"
                value={formData.order_time}
                onChange={(e) => handleInputChange('order_time', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createSalesOrderMutation.isPending}
              onClick={() => console.log('🚀 Create Order button clicked!')}
            >
              {createSalesOrderMutation.isPending ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
