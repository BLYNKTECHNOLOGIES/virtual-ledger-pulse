
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
  
  const [formData, setFormData] = useState({
    order_number: '',
    client_name: '',
    client_phone: '',
    platform: '',
    product_id: '',
    warehouse_id: '',
    quantity: 1,
    price_per_unit: 0,
    total_amount: 0,
    sales_payment_method_id: '',
    payment_status: 'COMPLETED',
    order_date: new Date().toISOString().split('T')[0],
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

  // Fetch warehouses
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_payment_methods').select('*').eq('is_active', true);
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
          client_phone: data.client_phone,
          platform: data.platform,
          product_id: data.product_id,
          warehouse_id: data.warehouse_id,
          quantity: data.quantity,
          price_per_unit: data.price_per_unit,
          total_amount: data.total_amount,
          sales_payment_method_id: data.sales_payment_method_id,
          payment_status: data.payment_status,
          order_date: data.order_date,
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

      return result;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales order created successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      setFormData({
        order_number: '',
        client_name: '',
        client_phone: '',
        platform: '',
        product_id: '',
        warehouse_id: '',
        quantity: 1,
        price_per_unit: 0,
        total_amount: 0,
        sales_payment_method_id: '',
        payment_status: 'COMPLETED',
        order_date: new Date().toISOString().split('T')[0],
        description: ''
      });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error creating sales order:', error);
      toast({ title: "Error", description: "Failed to create sales order", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSalesOrderMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate total amount when quantity or price changes
      if (field === 'quantity' || field === 'price_per_unit') {
        updated.total_amount = updated.quantity * updated.price_per_unit;
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
              <Label>Platform</Label>
              <Input
                value={formData.platform}
                onChange={(e) => handleInputChange('platform', e.target.value)}
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
              <Label>Warehouse</Label>
              <Select
                value={formData.warehouse_id}
                onValueChange={(value) => handleInputChange('warehouse_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
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
                onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label>Price Per Unit *</Label>
              <Input
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
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
                <SelectContent>
                  {paymentMethods?.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.type} {method.payment_gateway ? '(Gateway)' : '(Direct)'}
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
            >
              {createSalesOrderMutation.isPending ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
