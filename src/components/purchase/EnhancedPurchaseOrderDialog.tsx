
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { WarehouseSelector } from "@/components/stock/WarehouseSelector";

interface EnhancedPurchaseOrderDialogProps {
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

export function EnhancedPurchaseOrderDialog({ open, onOpenChange, editingOrder }: EnhancedPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    supplier_name: '',
    contact_number: '',
    order_date: new Date(),
    description: '',
    bank_account_id: '',
    purchase_payment_method_id: '',
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { product_id: '', quantity: 1, unit_price: 0, total_price: 0, warehouse_id: '' }
  ]);

  // Load editing data when editingOrder changes
  useEffect(() => {
    if (editingOrder) {
      setFormData({
        supplier_name: editingOrder.supplier_name || '',
        contact_number: editingOrder.contact_number || '',
        order_date: editingOrder.order_date ? new Date(editingOrder.order_date) : new Date(),
        description: editingOrder.description || '',
        bank_account_id: editingOrder.bank_account_id || '',
        purchase_payment_method_id: editingOrder.purchase_payment_method_id || '',
      });
      
      // Load order items if available
      if (editingOrder.purchase_order_items) {
        setOrderItems(editingOrder.purchase_order_items.map((item: any) => ({
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
        supplier_name: '',
        contact_number: '',
        order_date: new Date(),
        description: '',
        bank_account_id: '',
        purchase_payment_method_id: '',
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

  // Fetch bank accounts for dropdown
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

  // Fetch purchase payment methods for dropdown
  const { data: paymentMethods } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
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
    return `PO-${timestamp}-${random}`.toUpperCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const totalAmount = calculateTotalAmount();
      const orderNumber = editingOrder?.order_number || generateOrderNumber();

      // Validate bank account balance if bank account is selected
      if (formData.bank_account_id) {
        const { data: bankAccount } = await supabase
          .from('bank_accounts')
          .select('balance')
          .eq('id', formData.bank_account_id)
          .single();

        if (bankAccount && bankAccount.balance < totalAmount) {
          toast({
            title: "Insufficient Balance",
            description: "Bank account does not have sufficient balance for this purchase.",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Validate all items have warehouse selected
      const itemsWithoutWarehouse = orderItems.filter(item => !item.warehouse_id);
      if (itemsWithoutWarehouse.length > 0) {
        toast({
          title: "Warehouse Required",
          description: "Please select a warehouse for all order items.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      if (editingOrder) {
        // Update existing order
        const { error: orderError } = await supabase
          .from('purchase_orders')
          .update({
            supplier_name: formData.supplier_name,
            contact_number: formData.contact_number,
            order_date: format(formData.order_date, 'yyyy-MM-dd'),
            description: formData.description,
            bank_account_id: formData.bank_account_id || null,
            purchase_payment_method_id: formData.purchase_payment_method_id || null,
            total_amount: totalAmount,
          })
          .eq('id', editingOrder.id);

        if (orderError) throw orderError;

        // Delete existing order items and stock movements
        const { error: deleteItemsError } = await supabase
          .from('purchase_order_items')
          .delete()
          .eq('purchase_order_id', editingOrder.id);

        if (deleteItemsError) throw deleteItemsError;

        // Delete existing stock movements for this order
        const { error: deleteMovementsError } = await supabase
          .from('warehouse_stock_movements')
          .delete()
          .eq('reference_id', editingOrder.id)
          .eq('reference_type', 'PURCHASE_ORDER');

        if (deleteMovementsError) throw deleteMovementsError;

        // Insert updated order items
        const orderItemsData = orderItems.map(item => ({
          purchase_order_id: editingOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          warehouse_id: item.warehouse_id,
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(orderItemsData);

        if (itemsError) throw itemsError;

        // Create new warehouse stock movements
        for (const item of orderItems) {
          await supabase
            .from('warehouse_stock_movements')
            .insert({
              product_id: item.product_id,
              warehouse_id: item.warehouse_id,
              movement_type: 'IN',
              quantity: item.quantity,
              reference_type: 'PURCHASE_ORDER',
              reference_id: editingOrder.id,
              reason: `Purchase from ${formData.supplier_name}`,
            });
        }

        toast({
          title: "Success",
          description: "Purchase order updated successfully!",
        });
      } else {
        // Create new order
        const { data: orderData, error: orderError } = await supabase
          .from('purchase_orders')
          .insert([{
            order_number: orderNumber,
            supplier_name: formData.supplier_name,
            contact_number: formData.contact_number,
            order_date: format(formData.order_date, 'yyyy-MM-dd'),
            description: formData.description,
            bank_account_id: formData.bank_account_id || null,
            purchase_payment_method_id: formData.purchase_payment_method_id || null,
            total_amount: totalAmount,
            status: 'COMPLETED',
          }])
          .select()
          .single();

        if (orderError) {
          console.error('Error creating purchase order:', orderError);
          throw orderError;
        }

        console.log('Created purchase order:', orderData);

        // Insert order items
        const orderItemsData = orderItems.map(item => ({
          purchase_order_id: orderData.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          warehouse_id: item.warehouse_id,
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(orderItemsData);

        if (itemsError) {
          console.error('Error creating order items:', itemsError);
          throw itemsError;
        }

        console.log('Created order items successfully');

        // Create warehouse stock movements for each item
        for (const item of orderItems) {
          console.log('Creating warehouse stock movement for item:', item);
          
          const { error: movementError } = await supabase
            .from('warehouse_stock_movements')
            .insert({
              product_id: item.product_id,
              warehouse_id: item.warehouse_id,
              movement_type: 'IN',
              quantity: item.quantity,
              reference_type: 'PURCHASE_ORDER',
              reference_id: orderData.id,
              reason: `Purchase from ${formData.supplier_name}`,
            });

          if (movementError) {
            console.error('Error creating stock movement:', movementError);
            throw movementError;
          }

          console.log('Created warehouse stock movement successfully');

          // Update product total purchases and current stock
          const { data: currentProduct } = await supabase
            .from('products')
            .select('total_purchases, current_stock_quantity')
            .eq('id', item.product_id)
            .single();

          if (currentProduct) {
            const newTotalPurchases = (currentProduct.total_purchases || 0) + item.quantity;
            const newStockQuantity = (currentProduct.current_stock_quantity || 0) + item.quantity;

            const { error: updateError } = await supabase
              .from('products')
              .update({ 
                total_purchases: newTotalPurchases,
                current_stock_quantity: newStockQuantity
              })
              .eq('id', item.product_id);

            if (updateError) {
              console.error('Error updating product stock:', updateError);
              throw updateError;
            }

            console.log('Updated product stock successfully');
          }
        }

        // Update bank account balance if bank account is selected
        if (formData.bank_account_id) {
          const { data: bankAccount } = await supabase
            .from('bank_accounts')
            .select('balance')
            .eq('id', formData.bank_account_id)
            .single();

          if (bankAccount) {
            const { error: balanceError } = await supabase
              .from('bank_accounts')
              .update({ 
                balance: Math.max(0, bankAccount.balance - totalAmount)
              })
              .eq('id', formData.bank_account_id);

            if (balanceError) {
              console.error('Error updating bank balance:', balanceError);
              // Don't throw here as the order is already created
            }
          }
        }

        toast({
          title: "Success",
          description: "Purchase order created successfully and warehouse stock updated!",
        });
      }

      onOpenChange(false);
      window.location.reload(); // Refresh to show updated data
    } catch (error) {
      console.error('Error saving purchase order:', error);
      toast({
        title: "Error",
        description: `Failed to save purchase order: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingOrder ? 'Edit Purchase Order' : 'Create Purchase Order'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier_name">Supplier Name *</Label>
              <Input
                id="supplier_name"
                value={formData.supplier_name}
                onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="contact_number">Contact Number</Label>
              <Input
                id="contact_number"
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
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
              <Label htmlFor="bank_account">Bank Account</Label>
              <Select value={formData.bank_account_id} onValueChange={(value) => setFormData({ ...formData, bank_account_id: value })}>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="payment_method">Payment Method</Label>
              <Select value={formData.purchase_payment_method_id} onValueChange={(value) => setFormData({ ...formData, purchase_payment_method_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.type} - {method.bank_account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          {/* Order Items */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <Label className="text-lg font-medium">Order Items</Label>
              <Button type="button" onClick={addOrderItem} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
            
            <div className="space-y-4">
              {orderItems.map((item, index) => (
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
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 0)}
                    />
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
                    <WarehouseSelector
                      value={item.warehouse_id}
                      onValueChange={(value) => updateOrderItem(index, 'warehouse_id', value)}
                      label="Warehouse *"
                      placeholder="Select warehouse"
                      productId={item.product_id}
                      showStockInfo={true}
                    />
                  </div>
                  
                  <div>
                    <Label>Total Price</Label>
                    <Input
                      type="number"
                      value={item.total_price.toFixed(2)}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                  
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeOrderItem(index)}
                      disabled={orderItems.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
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
