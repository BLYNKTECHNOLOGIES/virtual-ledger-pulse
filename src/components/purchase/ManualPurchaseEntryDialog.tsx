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
    payment_method_type: '',
    bank_account_name: '',
    bank_account_number: '',
    ifsc_code: '',
    upi_id: '',
    pan_number: '',
    status: 'COMPLETED',
    deduction_bank_account_id: ''
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
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*');
      
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
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.supplier_name || !formData.quantity || !formData.price_per_unit || !formData.deduction_bank_account_id || !formData.product_id) {
        toast({
          title: "Error",
          description: "Please fill in all required fields including product and bank account for deduction",
          variant: "destructive"
        });
        return;
      }

      const orderNumber = generateOrderNumber();
      const totalAmount = parseFloat(formData.total_amount) || 0;

      // Create bank transaction to deduct amount
      const { error: transactionError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: formData.deduction_bank_account_id,
          transaction_type: 'EXPENSE',
          amount: totalAmount,
          description: `Purchase order: ${orderNumber} - ${formData.supplier_name}`,
          transaction_date: formData.order_date,
          category: 'Purchase',
          reference_number: orderNumber
        });

      if (transactionError) throw transactionError;

      // Create purchase order
      const { data: purchaseOrder, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: orderNumber,
          supplier_name: formData.supplier_name,
          order_date: formData.order_date,
          description: formData.description,
          total_amount: totalAmount,
          contact_number: formData.contact_number || null,
          payment_method_type: formData.payment_method_type || null,
          bank_account_name: formData.bank_account_name || null,
          bank_account_number: formData.bank_account_number || null,
          ifsc_code: formData.ifsc_code || null,
          upi_id: formData.upi_id || null,
          pan_number: formData.pan_number || null,
          status: formData.status,
          payment_method_used: formData.payment_method_type || null,
          bank_account_id: formData.deduction_bank_account_id
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create purchase order item
      const { error: itemError } = await supabase
        .from('purchase_order_items')
        .insert({
          purchase_order_id: purchaseOrder.id,
          product_id: formData.product_id,
          quantity: parseFloat(formData.quantity),
          unit_price: parseFloat(formData.price_per_unit),
          total_price: totalAmount
        });

      if (itemError) throw itemError;

      // Get current product stock and update it
      const { data: currentProduct, error: fetchError } = await supabase
        .from('products')
        .select('current_stock_quantity')
        .eq('id', formData.product_id)
        .single();

      if (fetchError) throw fetchError;

      // Update product stock (increase)
      const { error: stockError } = await supabase
        .from('products')
        .update({
          current_stock_quantity: currentProduct.current_stock_quantity + parseFloat(formData.quantity)
        })
        .eq('id', formData.product_id);

      if (stockError) throw stockError;

      toast({
        title: "Success",
        description: `Purchase order ${orderNumber} created successfully and stock updated`
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
        payment_method_type: '',
        bank_account_name: '',
        bank_account_number: '',
        ifsc_code: '',
        upi_id: '',
        pan_number: '',
        status: 'COMPLETED',
        deduction_bank_account_id: ''
      });

      setOpen(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error creating purchase order:', error);
      toast({
        title: "Error",
        description: "Failed to create purchase order",
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
              <SelectContent className="bg-white z-50">
                {products?.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} - {product.code} (Stock: {product.current_stock_quantity})
                  </SelectItem>
                ))}
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

          <div className="grid grid-cols-2 gap-4">
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
              <Label htmlFor="payment_method_type">Payment Method</Label>
              <Select 
                value={formData.payment_method_type} 
                onValueChange={(value) => handleInputChange('payment_method_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.payment_method_type === 'Bank Transfer' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bank_account_name">Bank Account Name</Label>
                <Input
                  id="bank_account_name"
                  value={formData.bank_account_name}
                  onChange={(e) => handleInputChange('bank_account_name', e.target.value)}
                  placeholder="Account holder name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bank_account_number">Account Number</Label>
                <Input
                  id="bank_account_number"
                  value={formData.bank_account_number}
                  onChange={(e) => handleInputChange('bank_account_number', e.target.value)}
                  placeholder="Account number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ifsc_code">IFSC Code</Label>
                <Input
                  id="ifsc_code"
                  value={formData.ifsc_code}
                  onChange={(e) => handleInputChange('ifsc_code', e.target.value)}
                  placeholder="IFSC code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pan_number">PAN Number</Label>
                <Input
                  id="pan_number"
                  value={formData.pan_number}
                  onChange={(e) => handleInputChange('pan_number', e.target.value)}
                  placeholder="PAN number"
                />
              </div>
            </div>
          )}

          {formData.payment_method_type === 'UPI' && (
            <div className="space-y-2">
              <Label htmlFor="upi_id">UPI ID</Label>
              <Input
                id="upi_id"
                value={formData.upi_id}
                onChange={(e) => handleInputChange('upi_id', e.target.value)}
                placeholder="Enter UPI ID"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value) => handleInputChange('status', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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