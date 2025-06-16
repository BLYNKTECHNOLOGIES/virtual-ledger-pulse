import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { WarehouseSelector } from "@/components/stock/WarehouseSelector";
import { StockStatusBadge } from "@/components/stock/StockStatusBadge";

interface EnhancedPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnhancedPurchaseOrderDialog({ open, onOpenChange }: EnhancedPurchaseOrderDialogProps) {
  const [formData, setFormData] = useState({
    orderNumber: '',
    supplierName: '',
    contactNumber: '',
    productId: '',
    quantity: 1,
    unitPrice: 0,
    totalAmount: 0,
    paymentMethodId: '',
    warehouseId: '',
    description: '',
    orderDate: new Date().toISOString().split('T')[0]
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch products with current stock information
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
      const { data, error } = await supabase.from('warehouses').select('*').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch purchase payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('purchase_payment_methods').select('*').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch clients for supplier linking
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Calculate total amount when quantity or unit price changes
  useEffect(() => {
    const total = formData.quantity * formData.unitPrice;
    setFormData(prev => ({ ...prev, totalAmount: total }));
  }, [formData.quantity, formData.unitPrice]);

  // Generate order number
  useEffect(() => {
    if (open && !formData.orderNumber) {
      const orderNum = `PO-${Date.now().toString().slice(-8)}`;
      setFormData(prev => ({ ...prev, orderNumber: orderNum }));
    }
  }, [open, formData.orderNumber]);

  const createPurchaseOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Create purchase order
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: data.orderNumber,
          supplier_name: data.supplierName,
          contact_number: data.contactNumber,
          total_amount: data.totalAmount,
          purchase_payment_method_id: data.paymentMethodId || null,
          warehouse_name: data.warehouseName,
          description: data.description,
          order_date: data.orderDate,
          status: 'PENDING',
          created_by: user?.id
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create purchase order item
      if (data.productId) {
        const { error: itemError } = await supabase
          .from('purchase_order_items')
          .insert({
            purchase_order_id: order.id,
            product_id: data.productId,
            quantity: data.quantity,
            unit_price: data.unitPrice,
            total_price: data.totalAmount,
            warehouse_id: data.warehouseId
          });

        if (itemError) throw itemError;

        // Create warehouse stock movement for purchase
        await supabase
          .from('warehouse_stock_movements')
          .insert({
            warehouse_id: data.warehouseId,
            product_id: data.productId,
            movement_type: 'IN',
            quantity: data.quantity,
            reason: 'Purchase Order',
            reference_id: order.id,
            reference_type: 'purchase_order',
            created_by: user?.id
          });
      }

      return order;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Purchase order created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_stock_summary'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create purchase order",
        variant: "destructive",
      });
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      orderNumber: '',
      supplierName: '',
      contactNumber: '',
      productId: '',
      quantity: 1,
      unitPrice: 0,
      totalAmount: 0,
      paymentMethodId: '',
      warehouseId: '',
      description: '',
      orderDate: new Date().toISOString().split('T')[0]
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.warehouseId) {
      toast({
        title: "Error",
        description: "Please select a warehouse",
        variant: "destructive",
      });
      return;
    }

    // Get warehouse name for the order
    const selectedWarehouse = warehouses?.find(w => w.id === formData.warehouseId);
    const dataToSubmit = {
      ...formData,
      warehouseName: selectedWarehouse?.name || ''
    };

    createPurchaseOrderMutation.mutate(dataToSubmit);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Purchase Order</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="orderNumber">Order Number</Label>
              <Input
                id="orderNumber"
                value={formData.orderNumber}
                onChange={(e) => handleInputChange('orderNumber', e.target.value)}
                placeholder="Auto-generated"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="orderDate">Order Date</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) => handleInputChange('orderDate', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplierName">Supplier Name</Label>
              <Select value={formData.supplierName} onValueChange={(value) => handleInputChange('supplierName', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select or enter supplier" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.name}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!formData.supplierName && (
                <Input
                  className="mt-2"
                  placeholder="Or enter new supplier name"
                  onChange={(e) => handleInputChange('supplierName', e.target.value)}
                />
              )}
            </div>
            
            <div>
              <Label htmlFor="contactNumber">Contact Number</Label>
              <Input
                id="contactNumber"
                value={formData.contactNumber}
                onChange={(e) => handleInputChange('contactNumber', e.target.value)}
                placeholder="Enter contact number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="productId">Product Name</Label>
              <Select value={formData.productId} onValueChange={(value) => handleInputChange('productId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{product.name} ({product.code})</span>
                        <StockStatusBadge productId={product.id} className="ml-2" />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <WarehouseSelector
                value={formData.warehouseId}
                onValueChange={(value) => handleInputChange('warehouseId', value)}
                productId={formData.productId}
                showStockInfo={!!formData.productId}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 1)}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="unitPrice">Unit Price (₹)</Label>
              <Input
                id="unitPrice"
                type="number"
                min="0"
                step="0.01"
                value={formData.unitPrice}
                onChange={(e) => handleInputChange('unitPrice', parseFloat(e.target.value) || 0)}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="totalAmount">Total Amount (₹)</Label>
              <Input
                id="totalAmount"
                type="number"
                value={formData.totalAmount}
                readOnly
                className="bg-gray-100"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="paymentMethodId">Payment Method</Label>
            <Select value={formData.paymentMethodId} onValueChange={(value) => handleInputChange('paymentMethodId', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods?.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    {method.type} {method.bank_account_name && `- ${method.bank_account_name}`}
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
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter order description"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPurchaseOrderMutation.isPending}>
              {createPurchaseOrderMutation.isPending ? "Creating..." : "Create Purchase Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
