
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

interface ProductItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  warehouse_id?: string;
}

interface NewPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewPurchaseOrderDialog({ open, onOpenChange }: NewPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    orderNumber: "",
    supplierName: "",
    contactNumber: "",
    orderDate: new Date().toISOString().split('T')[0],
    description: "",
    assignedTo: "",
    panNumber: "",
    tdsApplied: false,
    warehouseName: ""
  });

  const [items, setItems] = useState<ProductItem[]>([]);

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

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
  const tdsRate = 1; // 1% TDS
  const tdsAmount = formData.tdsApplied ? (subtotal * tdsRate) / 100 : 0;
  const netPayableAmount = subtotal - tdsAmount;

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: orderData.orderNumber,
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
          status: 'PENDING'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert order items
      const orderItems = items.map(item => ({
        purchase_order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        warehouse_id: item.warehouse_id
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Purchase order created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
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
      orderNumber: "",
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.orderNumber || !formData.supplierName || items.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in order number, supplier name and add at least one item.",
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
              <Label htmlFor="orderNumber">Order Number *</Label>
              <Input
                id="orderNumber"
                value={formData.orderNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                placeholder="Enter order number"
                required
              />
            </div>
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
