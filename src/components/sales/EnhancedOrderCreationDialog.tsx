
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

interface EnhancedOrderCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrderItem {
  order_number: string;
  client_name: string;
  order_date: string;
  description: string;
  platform: string;
  risk_level: string;
  sales_payment_method_id: string;
  total_amount: number;
  status: string;
  payment_status: string;
  quantity: number;
  price_per_unit: number;
  product_id?: string;
  warehouse_id?: string;
}

export function EnhancedOrderCreationDialog({ open, onOpenChange }: EnhancedOrderCreationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [orderItems, setOrderItems] = useState<OrderItem[]>([{
    order_number: '',
    client_name: '',
    order_date: new Date().toISOString().split('T')[0],
    description: '',
    platform: '',
    risk_level: 'HIGH',
    sales_payment_method_id: '',
    total_amount: 0,
    status: 'COMPLETED',
    payment_status: 'COMPLETED',
    quantity: 1,
    price_per_unit: 0,
    product_id: '',
    warehouse_id: ''
  }]);

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
      const { data, error } = await supabase.from('sales_payment_methods').select('*');
      if (error) throw error;
      return data;
    },
  });

  const createOrdersMutation = useMutation({
    mutationFn: async (orders: OrderItem[]) => {
      const ordersToInsert = orders.map(order => ({
        order_number: order.order_number,
        client_name: order.client_name,
        platform: order.platform,
        product_id: order.product_id || null,
        warehouse_id: order.warehouse_id || null,
        quantity: order.quantity,
        price_per_unit: order.price_per_unit,
        total_amount: order.total_amount,
        sales_payment_method_id: order.sales_payment_method_id || null,
        payment_status: order.payment_status,
        status: order.status,
        order_date: order.order_date,
        description: order.description,
        risk_level: order.risk_level
      }));

      const { data, error } = await supabase
        .from('sales_orders')
        .insert(ordersToInsert)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales orders created successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error creating sales orders:', error);
      toast({ title: "Error", description: "Failed to create sales orders", variant: "destructive" });
    }
  });

  const resetForm = () => {
    setOrderItems([{
      order_number: '',
      client_name: '',
      order_date: new Date().toISOString().split('T')[0],
      description: '',
      platform: '',
      risk_level: 'HIGH',
      sales_payment_method_id: '',
      total_amount: 0,
      status: 'COMPLETED',
      payment_status: 'COMPLETED',
      quantity: 1,
      price_per_unit: 0,
      product_id: '',
      warehouse_id: ''
    }]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createOrdersMutation.mutate(orderItems);
  };

  const updateOrderItem = (index: number, field: keyof OrderItem, value: any) => {
    setOrderItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-calculate total amount when quantity or price changes
      if (field === 'quantity' || field === 'price_per_unit') {
        updated[index].total_amount = updated[index].quantity * updated[index].price_per_unit;
      }
      
      return updated;
    });
  };

  const addOrderItem = () => {
    setOrderItems(prev => [...prev, {
      order_number: '',
      client_name: '',
      order_date: new Date().toISOString().split('T')[0],
      description: '',
      platform: '',
      risk_level: 'HIGH',
      sales_payment_method_id: '',
      total_amount: 0,
      status: 'COMPLETED',
      payment_status: 'COMPLETED',
      quantity: 1,
      price_per_unit: 0,
      product_id: '',
      warehouse_id: ''
    }]);
  };

  const removeOrderItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Multiple Sales Orders</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {orderItems.map((order, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Order {index + 1}</h3>
                {orderItems.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeOrderItem(index)}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Order Number *</Label>
                  <Input
                    value={order.order_number}
                    onChange={(e) => updateOrderItem(index, 'order_number', e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label>Customer Name *</Label>
                  <Input
                    value={order.client_name}
                    onChange={(e) => updateOrderItem(index, 'client_name', e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label>Platform</Label>
                  <Input
                    value={order.platform}
                    onChange={(e) => updateOrderItem(index, 'platform', e.target.value)}
                  />
                </div>

                <div>
                  <Label>Product</Label>
                  <Select
                    value={order.product_id}
                    onValueChange={(value) => updateOrderItem(index, 'product_id', value)}
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
                    value={order.warehouse_id}
                    onValueChange={(value) => updateOrderItem(index, 'warehouse_id', value)}
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
                  <Label>Payment Method</Label>
                  <Select
                    value={order.sales_payment_method_id}
                    onValueChange={(value) => updateOrderItem(index, 'sales_payment_method_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods?.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.type} - {method.risk_category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    value={order.quantity}
                    onChange={(e) => updateOrderItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    required
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <Label>Price Per Unit *</Label>
                  <Input
                    type="number"
                    value={order.price_per_unit}
                    onChange={(e) => updateOrderItem(index, 'price_per_unit', parseFloat(e.target.value) || 0)}
                    required
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <Label>Total Amount</Label>
                  <Input
                    type="number"
                    value={order.total_amount}
                    disabled
                    className="bg-gray-100"
                  />
                </div>

                <div>
                  <Label>Order Date</Label>
                  <Input
                    type="date"
                    value={order.order_date}
                    onChange={(e) => updateOrderItem(index, 'order_date', e.target.value)}
                  />
                </div>

                <div>
                  <Label>Risk Level</Label>
                  <Select
                    value={order.risk_level}
                    onValueChange={(value) => updateOrderItem(index, 'risk_level', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low Risk</SelectItem>
                      <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                      <SelectItem value="HIGH">High Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-3">
                  <Label>Description</Label>
                  <Textarea
                    value={order.description}
                    onChange={(e) => updateOrderItem(index, 'description', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={addOrderItem}>
              Add Another Order
            </Button>
            
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createOrdersMutation.isPending}
              >
                {createOrdersMutation.isPending ? "Creating..." : "Create Orders"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
