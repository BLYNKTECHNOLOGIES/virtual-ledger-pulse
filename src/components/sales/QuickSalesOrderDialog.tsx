import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface QuickSalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SalesOrderFormData {
  order_number: string;
  client_name: string;
  client_phone: string;
  platform: string;
  total_amount: number;
  quantity: number;
  price_per_unit: number;
  bank_account_id: string;
  product_id: string;
}

export function QuickSalesOrderDialog({ open, onOpenChange }: QuickSalesOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<SalesOrderFormData>({
    order_number: "",
    client_name: "",
    client_phone: "",
    platform: "BINANCE",
    total_amount: 0,
    quantity: 0,
    price_per_unit: 0,
    bank_account_id: "",
    product_id: ""
  });

  // Fetch bank accounts
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
    enabled: open
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  const createSalesOrderMutation = useMutation({
    mutationFn: async (orderData: SalesOrderFormData) => {
      console.log('🚀 Creating sales order...');
      
      // Get bank account details
      const { data: bankAccount, error: bankError } = await supabase
        .from('bank_accounts')
        .select('balance, account_name')
        .eq('id', orderData.bank_account_id)
        .single();

      if (bankError) throw bankError;
      if (!bankAccount) throw new Error('Bank account not found');

      // Create the sales order with bank account ID for trigger
      const { data: salesOrder, error: salesError } = await supabase
        .from('sales_orders')
        .insert({
          order_number: orderData.order_number,
          client_name: orderData.client_name,
          client_phone: orderData.client_phone,
          platform: orderData.platform,
          product_id: orderData.product_id || null,
          quantity: orderData.quantity,
          price_per_unit: orderData.price_per_unit,
          total_amount: orderData.total_amount,
          order_date: new Date().toISOString(),
          payment_status: 'COMPLETED',
          status: 'COMPLETED',
          settlement_status: 'DIRECT',
          bank_account_id: orderData.bank_account_id, // Add bank account for trigger
          description: `Sales Order - ${orderData.order_number}`
        })
        .select()
        .single();

      if (salesError) throw salesError;
      console.log('✅ Sales order created:', salesOrder.id);

      // Note: Bank transaction will be automatically created by database triggers
      console.log('✅ Sales order created - bank transaction will be handled by triggers');

      // If product is specified and not USDT, update stock
      if (orderData.product_id) {
        const { data: product } = await supabase
          .from('products')
          .select('code, current_stock_quantity')
          .eq('id', orderData.product_id)
          .single();

        if (product && product.code !== 'USDT') {
          const { error: stockError } = await supabase
            .from('products')
            .update({ 
              current_stock_quantity: (product.current_stock_quantity || 0) - orderData.quantity,
              total_sales: orderData.total_amount
            })
            .eq('id', orderData.product_id);

          if (stockError) console.warn('Stock update failed:', stockError);
        }
      }

      return salesOrder;
    },
    onSuccess: (salesOrder) => {
      toast({
        title: "Sales Order Created Successfully",
        description: `Order ${salesOrder.order_number} created and balance credited to account`,
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('❌ Sales order creation failed:', error);
      toast({
        title: "Error Creating Sales Order",
        description: `Failed to create sales order: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const resetForm = () => {
    setFormData({
      order_number: "",
      client_name: "",
      client_phone: "",
      platform: "BINANCE",
      total_amount: 0,
      quantity: 0,
      price_per_unit: 0,
      bank_account_id: "",
      product_id: ""
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.order_number || !formData.client_name || !formData.bank_account_id) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in order number, client name, and bank account",
        variant: "destructive",
      });
      return;
    }
    createSalesOrderMutation.mutate(formData);
  };

  // Auto-calculate values
  const handleQuantityOrPriceChange = (field: 'quantity' | 'price_per_unit', value: number) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      updated.total_amount = updated.quantity * updated.price_per_unit;
      return updated;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800">
            Quick Sales Order Creation
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="order_number">Order Number *</Label>
              <Input
                id="order_number"
                value={formData.order_number}
                onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))}
                placeholder="e.g., 788787"
                required
              />
            </div>
            <div>
              <Label htmlFor="client_name">Customer Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData(prev => ({ ...prev, client_name: e.target.value }))}
                placeholder="e.g., ghghgh"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client_phone">Phone</Label>
              <Input
                id="client_phone"
                value={formData.client_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, client_phone: e.target.value }))}
                placeholder="e.g., 898989"
              />
            </div>
            <div>
              <Label htmlFor="platform">Platform</Label>
              <Select value={formData.platform} onValueChange={(value) => setFormData(prev => ({ ...prev, platform: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BINANCE">BINANCE</SelectItem>
                  <SelectItem value="WAZIRX">WAZIRX</SelectItem>
                  <SelectItem value="COINBASE">COINBASE</SelectItem>
                  <SelectItem value="OTHER">OTHER</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => handleQuantityOrPriceChange('quantity', parseFloat(e.target.value) || 0)}
                placeholder="e.g., 700"
              />
            </div>
            <div>
              <Label htmlFor="price_per_unit">Price per Unit</Label>
              <Input
                id="price_per_unit"
                type="number"
                step="0.01"
                value={formData.price_per_unit}
                onChange={(e) => handleQuantityOrPriceChange('price_per_unit', parseFloat(e.target.value) || 0)}
                placeholder="e.g., 94"
              />
            </div>
            <div>
              <Label htmlFor="total_amount">Total Amount</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                value={formData.total_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, total_amount: parseFloat(e.target.value) || 0 }))}
                placeholder="e.g., 65800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bank_account_id">Bank Account *</Label>
              <Select value={formData.bank_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name} (₹{account.balance})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="product_id">Product (Optional)</Label>
              <Select value={formData.product_id} onValueChange={(value) => setFormData(prev => ({ ...prev, product_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createSalesOrderMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {createSalesOrderMutation.isPending ? "Creating..." : "Create Sales Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}