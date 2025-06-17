
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductSelectionSection } from "./ProductSelectionSection";

interface Product {
  id: string;
  name: string;
  cost_price: number;
  code: string;
  unit_of_measurement: string;
}

interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  warehouseId?: string;
}

interface NewPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewPurchaseOrderDialog({ open, onOpenChange }: NewPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    supplierName: "",
    contactNumber: "",
    orderDate: new Date().toISOString().split('T')[0],
    description: "",
    assignedTo: "",
    panNumber: "",
    tdsApplied: false,
    warehouseName: ""
  });

  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState("");

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Product[];
    },
  });

  // Fetch warehouses
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
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
  });

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const tdsRate = 1; // 1% TDS
  const tdsAmount = formData.tdsApplied ? (subtotal * tdsRate) / 100 : 0;
  const netPayableAmount = subtotal - tdsAmount;

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      // Generate order number
      const orderNumber = `PO-${Date.now()}`;

      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: orderNumber,
          supplier_name: orderData.supplierName,
          contact_number: orderData.contactNumber,
          order_date: orderData.orderDate,
          total_amount: subtotal,
          tds_applied: orderData.tdsApplied,
          tds_amount: tdsAmount,
          net_payable_amount: netPayableAmount,
          pan_number: orderData.panNumber,
          description: orderData.description,
          assigned_to: orderData.assignedTo,
          warehouse_name: orderData.warehouseName,
          bank_account_id: selectedPaymentAccount || null,
          status: 'PENDING'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert order items
      const orderItems = items.map(item => ({
        purchase_order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        warehouse_id: item.warehouseId
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Reduce payment limit from selected account if selected
      if (selectedPaymentAccount) {
        const amountToDeduct = formData.tdsApplied ? netPayableAmount : subtotal;
        
        const { data: paymentMethods, error: pmError } = await supabase
          .from('purchase_payment_methods')
          .select('*')
          .eq('bank_account_id', selectedPaymentAccount)
          .eq('is_active', true);

        if (!pmError && paymentMethods && paymentMethods.length > 0) {
          const paymentMethod = paymentMethods[0];
          const { error: updateError } = await supabase
            .from('purchase_payment_methods')
            .update({ 
              current_usage: paymentMethod.current_usage + amountToDeduct,
              updated_at: new Date().toISOString()
            })
            .eq('id', paymentMethod.id);

          if (updateError) console.error('Error updating payment method usage:', updateError);
        }
      }

      return order;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Purchase order created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      if (selectedPaymentAccount) {
        queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      }
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create purchase order: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      supplierName: "",
      contactNumber: "",
      orderDate: new Date().toISOString().split('T')[0],
      description: "",
      assignedTo: "",
      panNumber: "",
      tdsApplied: false,
      warehouseName: ""
    });
    setItems([]);
    setSelectedPaymentAccount("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.supplierName || items.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in supplier name and add at least one item.",
        variant: "destructive",
      });
      return;
    }

    createOrderMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Purchase Order</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplierName">Supplier Name *</Label>
              <Input
                id="supplierName"
                value={formData.supplierName}
                onChange={(e) => setFormData(prev => ({ ...prev, supplierName: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="contactNumber">Contact Number</Label>
              <Input
                id="contactNumber"
                value={formData.contactNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, contactNumber: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="orderDate">Order Date *</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) => setFormData(prev => ({ ...prev, orderDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="assignedTo">Assigned To</Label>
              <Input
                id="assignedTo"
                value={formData.assignedTo}
                onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="warehouseName">Warehouse</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, warehouseName: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.name}>
                    {warehouse.name} - {warehouse.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Product Selection */}
          <ProductSelectionSection
            products={products || []}
            warehouses={warehouses || []}
            items={items}
            onItemsChange={setItems}
          />

          {/* TDS Section */}
          <Card>
            <CardHeader>
              <CardTitle>Tax Deducted at Source (TDS)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="tdsApplied"
                  checked={formData.tdsApplied}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, tdsApplied: checked as boolean }))
                  }
                />
                <Label htmlFor="tdsApplied">Apply TDS (1%)</Label>
              </div>

              {formData.tdsApplied && (
                <div>
                  <Label htmlFor="panNumber">PAN Number *</Label>
                  <Input
                    id="panNumber"
                    value={formData.panNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, panNumber: e.target.value }))}
                    placeholder="Enter supplier's PAN number"
                    required={formData.tdsApplied}
                  />
                </div>
              )}

              <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                {formData.tdsApplied && (
                  <>
                    <div className="flex justify-between text-red-600">
                      <span>TDS (1%):</span>
                      <span>-₹{tdsAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-green-600 border-t pt-2">
                      <span>Net Payable Amount:</span>
                      <span>₹{netPayableAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {!formData.tdsApplied && (
                  <div className="flex justify-between font-bold border-t pt-2">
                    <span>Total Amount:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment Account Selection */}
          <div>
            <Label htmlFor="paymentAccount">Payment Account (Optional)</Label>
            <Select onValueChange={setSelectedPaymentAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name} - {account.bank_name} (₹{account.balance.toFixed(2)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createOrderMutation.isPending}>
              {createOrderMutation.isPending ? "Creating..." : "Create Purchase Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
