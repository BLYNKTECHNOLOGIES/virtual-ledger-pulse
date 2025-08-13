import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface ManualPurchaseEntryDialogProps {
  onSuccess?: () => void;
}

export const ManualPurchaseEntryDialog: React.FC<ManualPurchaseEntryDialogProps> = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    supplier_name: '',
    order_date: new Date().toISOString().split('T')[0],
    description: '',
    product_id: '',
    quantity: '',
    price_per_unit: '',
    total_amount: '',
    contact_number: '',
    status: 'COMPLETED',
    deduction_bank_account_id: '',
    credit_wallet_id: ''
  });

  // Fetch purchase payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['purchase-payment-methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE');
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch products
  const { data: products, isLoading: productsLoading, error: productsError } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      console.log('🔄 ManualPurchase: Fetching products...');
      const { data, error } = await supabase
        .from('products')
        .select('*');
      
      if (error) {
        console.error('❌ ManualPurchase: Products fetch error:', error);
        throw error;
      }
      console.log('✅ ManualPurchase: Products fetched:', data);
      return data;
    }
  });

  // Fetch active wallets
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
    }
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate total amount
      if (field === 'quantity' || field === 'price_per_unit') {
        const quantity = parseFloat(field === 'quantity' ? value : updated.quantity) || 0;
        const pricePerUnit = parseFloat(field === 'price_per_unit' ? value : updated.price_per_unit) || 0;
        updated.total_amount = (quantity * pricePerUnit).toString();
      }
      
      return updated;
    });
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now();
    return `PUR-${timestamp}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 ManualPurchase: handleSubmit called with formData:', formData);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.supplier_name || !formData.quantity || !formData.price_per_unit || !formData.deduction_bank_account_id || !formData.product_id) {
        console.log('❌ ManualPurchase: Validation failed:', {
          supplier_name: !!formData.supplier_name,
          quantity: !!formData.quantity,
          price_per_unit: !!formData.price_per_unit,
          deduction_bank_account_id: !!formData.deduction_bank_account_id,
          product_id: !!formData.product_id
        });
        toast({
          title: "Error",
          description: "Please fill in all required fields including product and bank account for deduction",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Validate wallet selection for USDT products
      const selectedProduct = products?.find(p => p.id === formData.product_id);
      console.log('🔍 ManualPurchase: Selected product:', selectedProduct);
      
      if (selectedProduct?.code === 'USDT' && !formData.credit_wallet_id) {
        console.log('❌ ManualPurchase: USDT product requires wallet selection');
        toast({
          title: "Error", 
          description: "Please select a wallet to credit the purchased USDT",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      const orderNumber = generateOrderNumber();
      const totalAmount = parseFloat(formData.total_amount) || 0;

      console.log('📝 ManualPurchase: Creating purchase order with params:', {
        orderNumber,
        supplier_name: formData.supplier_name,
        order_date: formData.order_date,
        description: formData.description,
        total_amount: totalAmount,
        contact_number: formData.contact_number,
        status: formData.status,
        bank_account_id: formData.deduction_bank_account_id,
        product_id: formData.product_id,
        quantity: parseFloat(formData.quantity),
        unit_price: parseFloat(formData.price_per_unit),
        credit_wallet_id: formData.credit_wallet_id
      });

      // Use the stock-only function that completely avoids bank transactions
      const { data: result, error: functionError } = await supabase.rpc(
        'create_manual_purchase_stock_only',
        {
          p_order_number: orderNumber,
          p_supplier_name: formData.supplier_name,
          p_order_date: formData.order_date,
          p_description: formData.description || '',
          p_total_amount: totalAmount,
          p_contact_number: formData.contact_number || null,
          p_product_id: formData.product_id,
          p_quantity: parseFloat(formData.quantity),
          p_unit_price: parseFloat(formData.price_per_unit),
          p_credit_wallet_id: formData.credit_wallet_id || null
        }
      );

      console.log('📡 ManualPurchase: RPC function response:', { result, functionError });

      if (functionError) {
        console.error('❌ ManualPurchase: Purchase order creation failed:', functionError);
        throw functionError;
      }

      console.log('✅ ManualPurchase: Purchase order created successfully with ID:', result);

      
      toast({
        title: "Success",
        description: `Purchase order ${orderNumber} created successfully! Stock updated. Note: Bank transaction not created due to account restrictions.`
      });

      // Reset form
      setFormData({
        supplier_name: '',
        order_date: new Date().toISOString().split('T')[0],
        description: '',
        product_id: '',
        quantity: '',
        price_per_unit: '',
        total_amount: '',
        contact_number: '',
        status: 'COMPLETED',
        deduction_bank_account_id: '',
        credit_wallet_id: ''
      });

      setOpen(false);
      onSuccess?.();

    } catch (error) {
      console.error('❌ ManualPurchase: Error creating purchase order:', error);
      toast({
        title: "Error",
        description: `Failed to create purchase order: ${error.message || 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" />
          Manual Purchase Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Manual Purchase Entry
          </DialogTitle>
          <DialogDescription>
            Create a new purchase order manually
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier_name">Supplier Name *</Label>
              <Input
                id="supplier_name"
                value={formData.supplier_name}
                onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                placeholder="Enter supplier name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order_date">Order Date</Label>
              <Input
                id="order_date"
                type="date"
                value={formData.order_date}
                onChange={(e) => handleInputChange('order_date', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_id">Product *</Label>
            <Select 
              value={formData.product_id} 
              onValueChange={(value) => handleInputChange('product_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent className="bg-white z-[60] border border-gray-200 shadow-lg">
                {productsLoading ? (
                  <SelectItem value="loading" disabled>Loading products...</SelectItem>
                ) : productsError ? (
                  <SelectItem value="error" disabled>Error loading products</SelectItem>
                ) : !products || products.length === 0 ? (
                  <SelectItem value="empty" disabled>No products found</SelectItem>
                ) : (
                  products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - {product.code} (Stock: {product.current_stock_quantity})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter purchase description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price_per_unit">Price per Unit *</Label>
              <Input
                id="price_per_unit"
                type="number"
                step="0.01"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_amount">Total Amount</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                value={formData.total_amount}
                onChange={(e) => handleInputChange('total_amount', e.target.value)}
                placeholder="0.00"
                readOnly
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deduction_bank_account_id">Deduct Amount from Bank Account *</Label>
            <Select 
              value={formData.deduction_bank_account_id} 
              onValueChange={(value) => handleInputChange('deduction_bank_account_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select bank account for deduction" />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {bankAccounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.bank_name} - {account.account_name} (₹{account.balance})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Show wallet selection for USDT products */}
          {products?.find(p => p.id === formData.product_id)?.code === 'USDT' && (
            <div className="space-y-2">
              <Label htmlFor="credit_wallet_id">Credit to Wallet *</Label>
              <Select 
                value={formData.credit_wallet_id} 
                onValueChange={(value) => handleInputChange('credit_wallet_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet to credit purchased USDT" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  {wallets?.filter(w => w.wallet_type === 'USDT').map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} - {wallet.wallet_type} (₹{wallet.current_balance})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="contact_number">Contact Number</Label>
            <Input
              id="contact_number"
              value={formData.contact_number}
              onChange={(e) => handleInputChange('contact_number', e.target.value)}
              placeholder="Enter contact number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value) => handleInputChange('status', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Purchase Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};