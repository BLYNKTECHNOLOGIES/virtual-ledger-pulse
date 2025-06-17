import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useProductStockSummary } from "@/hooks/useWarehouseStock";

interface EnhancedOrderCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingOrder?: any;
}

interface OrderItem {
  id?: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  warehouse_id: string;
}

export function EnhancedOrderCreationDialog({ open, onOpenChange, editingOrder }: EnhancedOrderCreationDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    client_name: '',
    order_date: new Date(),
    delivery_date: new Date(),
    description: '',
    platform: '',
    risk_level: 'MEDIUM',
    sales_payment_method_id: '',
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { product_id: '', quantity: 1, unit_price: 0, total_price: 0, warehouse_id: '' }
  ]);

  const { data: productStockSummaries } = useProductStockSummary();

  useEffect(() => {
    if (editingOrder) {
      setFormData({
        client_name: editingOrder.client_name || '',
        order_date: editingOrder.order_date ? new Date(editingOrder.order_date) : new Date(),
        delivery_date: editingOrder.delivery_date ? new Date(editingOrder.delivery_date) : new Date(),
        description: editingOrder.description || '',
        platform: editingOrder.platform || '',
        risk_level: editingOrder.risk_level || 'MEDIUM',
        sales_payment_method_id: editingOrder.sales_payment_method_id || '',
      });
      
      // Load order items if available
      if (editingOrder.sales_order_items) {
        setOrderItems(editingOrder.sales_order_items.map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          warehouse_id: item.warehouse_id,
        })));
      }
    } else {
      // Reset form for new order
      setFormData({
        client_name: '',
        order_date: new Date(),
        delivery_date: new Date(),
        description: '',
        platform: '',
        risk_level: 'MEDIUM',
        sales_payment_method_id: '',
      });
      setOrderItems([{ product_id: '', quantity: 1, unit_price: 0, total_price: 0, warehouse_id: '' }]);
    }
  }, [editingOrder]);

  // Fetch products for dropdown
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
  });

  // Fetch warehouses for dropdown
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

  // Fetch sales payment methods
  const { data: salesPaymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select('*')
        .eq('is_active', true)
        .order('type');
      
      if (error) throw error;
      return data;
    },
  });

  const addOrderItem = () => {
    setOrderItems([...orderItems, { product_id: '', quantity: 1, unit_price: 0, total_price: 0, warehouse_id: '' }]);
  };

  const removeOrderItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index));
    }
  };

  const updateOrderItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const updatedItems = [...orderItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Calculate total price when quantity or unit price changes
    if (field === 'quantity' || field === 'unit_price') {
      updatedItems[index].total_price = updatedItems[index].quantity * updatedItems[index].unit_price;
    }
    
    setOrderItems(updatedItems);
  };

  const calculateTotalAmount = () => {
    return orderItems.reduce((sum, item) => sum + item.total_price, 0);
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `SO-${timestamp}-${random}`.toUpperCase();
  };

  const getAvailableStock = (productId: string, warehouseId: string) => {
    const productStock = productStockSummaries?.find(p => p.product_id === productId);
    if (!productStock) return 0;
    
    const warehouseStock = productStock.warehouse_stocks.find(ws => ws.warehouse_id === warehouseId);
    return warehouseStock?.quantity || 0;
  };

  const validateStockAvailability = () => {
    for (const item of orderItems) {
      if (!item.product_id || !item.warehouse_id) continue;
      
      const availableStock = getAvailableStock(item.product_id, item.warehouse_id);
      if (item.quantity > availableStock) {
        const product = products?.find(p => p.id === item.product_id);
        const warehouse = warehouses?.find(w => w.id === item.warehouse_id);
        
        toast({
          title: "Insufficient Stock",
          description: `Not enough stock for ${product?.name} in ${warehouse?.name}. Available: ${availableStock}, Required: ${item.quantity}`,
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate stock availability
      if (!validateStockAvailability()) {
        setIsSubmitting(false);
        return;
      }

      const totalAmount = calculateTotalAmount();
      const orderNumber = editingOrder?.order_number || generateOrderNumber();

      // Validate payment method balance if selected
      if (formData.sales_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('payment_limit, current_usage')
          .eq('id', formData.sales_payment_method_id)
          .single();

        if (paymentMethod) {
          const availableLimit = paymentMethod.payment_limit - (paymentMethod.current_usage || 0);
          if (totalAmount > availableLimit) {
            toast({
              title: "Payment Limit Exceeded",
              description: `Order amount exceeds available payment method limit. Available: ₹${availableLimit}`,
              variant: "destructive",
            });
            setIsSubmitting(false);
            return;
          }
        }
      }

      if (editingOrder) {
        // Update existing order logic (simplified for brevity)
        const { error: orderError } = await supabase
          .from('sales_orders')
          .update({
            client_name: formData.client_name,
            order_date: format(formData.order_date, 'yyyy-MM-dd'),
            delivery_date: format(formData.delivery_date, 'yyyy-MM-dd'),
            description: formData.description,
            platform: formData.platform,
            risk_level: formData.risk_level,
            sales_payment_method_id: formData.sales_payment_method_id || null,
            amount: totalAmount,
            quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0),
          })
          .eq('id', editingOrder.id);
    
        if (orderError) throw orderError;
    
        // Delete existing order items
        const { error: deleteError } = await supabase
          .from('sales_order_items')
          .delete()
          .eq('sales_order_id', editingOrder.id);
    
        if (deleteError) throw deleteError;
    
        // Process each order item and update stock
        for (const item of orderItems) {
          // Add warehouse stock movement (OUT)
          await supabase
            .from('warehouse_stock_movements')
            .insert({
              product_id: item.product_id,
              warehouse_id: item.warehouse_id,
              movement_type: 'OUT',
              quantity: item.quantity,
              reference_type: 'SALES_ORDER',
              reference_id: editingOrder.id,
              reason: `Sale to ${formData.client_name}`,
            });
    
          // Update product current stock quantity
          const { data: currentProduct } = await supabase
            .from('products')
            .select('current_stock_quantity')
            .eq('id', item.product_id)
            .single();
    
          if (currentProduct) {
            const newStock = Math.max(0, currentProduct.current_stock_quantity - item.quantity);
            await supabase
              .from('products')
              .update({ 
                current_stock_quantity: newStock 
              })
              .eq('id', item.product_id);
          }
    
          // Add stock transaction record
          await supabase
            .from('stock_transactions')
            .insert({
              product_id: item.product_id,
              transaction_type: 'SALE',
              quantity: -item.quantity, // Negative for sales
              unit_price: item.unit_price,
              total_amount: item.total_price,
              transaction_date: format(formData.order_date, 'yyyy-MM-dd'),
              reference_number: orderNumber,
              supplier_customer_name: formData.client_name,
            });
        }
    
        toast({
          title: "Success",
          description: "Sales order updated successfully and stock updated!",
        });
      } else {
        // Create new sales order
        const { data: orderData, error: orderError } = await supabase
          .from('sales_orders')
          .insert([{
            order_number: orderNumber,
            client_name: formData.client_name,
            order_date: format(formData.order_date, 'yyyy-MM-dd'),
            delivery_date: format(formData.delivery_date, 'yyyy-MM-dd'),
            description: formData.description,
            platform: formData.platform,
            risk_level: formData.risk_level,
            sales_payment_method_id: formData.sales_payment_method_id || null,
            amount: totalAmount,
            status: 'COMPLETED',
            payment_status: 'COMPLETED',
            quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0),
          }])
          .select()
          .single();

        if (orderError) throw orderError;

        // Process each order item and update stock
        for (const item of orderItems) {
          // Add warehouse stock movement (OUT)
          await supabase
            .from('warehouse_stock_movements')
            .insert({
              product_id: item.product_id,
              warehouse_id: item.warehouse_id,
              movement_type: 'OUT',
              quantity: item.quantity,
              reference_type: 'SALES_ORDER',
              reference_id: orderData.id,
              reason: `Sale to ${formData.client_name}`,
            });

          // Update product current stock quantity
          const { data: currentProduct } = await supabase
            .from('products')
            .select('current_stock_quantity')
            .eq('id', item.product_id)
            .single();

          if (currentProduct) {
            const newStock = Math.max(0, currentProduct.current_stock_quantity - item.quantity);
            await supabase
              .from('products')
              .update({ 
                current_stock_quantity: newStock 
              })
              .eq('id', item.product_id);
          }

          // Add stock transaction record
          await supabase
            .from('stock_transactions')
            .insert({
              product_id: item.product_id,
              transaction_type: 'SALE',
              quantity: -item.quantity, // Negative for sales
              unit_price: item.unit_price,
              total_amount: item.total_price,
              transaction_date: format(formData.order_date, 'yyyy-MM-dd'),
              reference_number: orderNumber,
              supplier_customer_name: formData.client_name,
            });
        }

        // Update payment method usage if selected
        if (formData.sales_payment_method_id) {
          const { data: paymentMethod } = await supabase
            .from('sales_payment_methods')
            .select('current_usage')
            .eq('id', formData.sales_payment_method_id)
            .single();

          if (paymentMethod) {
            await supabase
              .from('sales_payment_methods')
              .update({ 
                current_usage: (paymentMethod.current_usage || 0) + totalAmount 
              })
              .eq('id', formData.sales_payment_method_id);
          }
        }

        toast({
          title: "Success",
          description: "Sales order created successfully and stock updated!",
        });
      }

      onOpenChange(false);
      window.location.reload(); // Refresh to show updated data
    } catch (error) {
      console.error('Error saving sales order:', error);
      toast({
        title: "Error",
        description: "Failed to save sales order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ... keep existing code (JSX return statement with form, but add warehouse selection and stock validation display)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingOrder ? 'Edit Sales Order' : 'Create Sales Order'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client_name">Client Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="platform">Platform</Label>
              <Input
                id="platform"
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Order Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.order_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.order_date ? format(formData.order_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.order_date}
                    onSelect={(date) => setFormData({ ...formData, order_date: date || new Date() })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Delivery Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.delivery_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.delivery_date ? format(formData.delivery_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.delivery_date}
                    onSelect={(date) => setFormData({ ...formData, delivery_date: date || new Date() })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="risk_level">Risk Level</Label>
              <Select value={formData.risk_level} onValueChange={(value) => setFormData({ ...formData, risk_level: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sales_payment_method_id">Payment Method</Label>
              <Select value={formData.sales_payment_method_id} onValueChange={(value) => setFormData({ ...formData, sales_payment_method_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {salesPaymentMethods?.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Order Items */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <Label className="text-lg font-medium">Order Items</Label>
              <Button type="button" onClick={() => setOrderItems([...orderItems, { product_id: '', quantity: 1, unit_price: 0, total_price: 0, warehouse_id: '' }])} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
            
            <div className="space-y-4">
              {orderItems.map((item, index) => {
                const availableStock = item.product_id && item.warehouse_id ? getAvailableStock(item.product_id, item.warehouse_id) : 0;
                const stockInsufficient = item.quantity > availableStock;
                
                return (
                  <div key={index} className="grid grid-cols-6 gap-4 items-end p-4 border rounded-lg">
                    <div>
                      <Label>Product *</Label>
                      <Select
                        value={item.product_id}
                        onValueChange={(value) => updateOrderItem(index, 'product_id', value)}
                      >
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
                    
                    <div>
                      <Label>Warehouse *</Label>
                      <Select
                        value={item.warehouse_id}
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
                      <Label>Available Stock</Label>
                      <Input
                        value={availableStock}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                    
                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        max={availableStock}
                        value={item.quantity}
                        onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        className={stockInsufficient ? "border-red-500" : ""}
                      />
                      {stockInsufficient && (
                        <p className="text-red-500 text-xs mt-1">Insufficient stock</p>
                      )}
                    </div>
                    
                    <div>
                      <Label>Unit Price *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateOrderItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOrderItems(orderItems.filter((_, i) => i !== index))}
                        disabled={orderItems.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total Amount */}
          <div className="flex justify-end">
            <div className="text-lg font-semibold">
              Total Amount: ₹{calculateTotalAmount().toFixed(2)}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingOrder ? "Update Order" : "Create Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
