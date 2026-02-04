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
    { product_id: '', quantity: 1, unit_price: 0, total_price: 0 }
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
      
      if (editingOrder.purchase_order_items) {
        setOrderItems(editingOrder.purchase_order_items.map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        })));
      }
    } else {
      setFormData({
        supplier_name: '',
        contact_number: '',
        order_date: new Date(),
        description: '',
        bank_account_id: '',
        purchase_payment_method_id: '',
      });
      setOrderItems([{ product_id: '', quantity: 1, unit_price: 0, total_price: 0 }]);
    }
  }, [editingOrder]);

  // Fetch products, bank accounts, and payment methods
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: bankAccounts, isLoading: bankAccountsLoading } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: paymentMethods, isLoading: paymentMethodsLoading } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select(`
          *,
          bank_accounts!purchase_payment_methods_bank_account_name_fkey(status)
        `)
        .eq('is_active', true)
        .order('type');
      
      if (error) throw error;
      // Filter out methods with inactive bank accounts
      return (data || []).filter(method => method.bank_accounts?.status === 'ACTIVE');
    },
    enabled: open,
  });

  const isLoading = productsLoading || bankAccountsLoading || paymentMethodsLoading;

  const addOrderItem = () => {
    setOrderItems([...orderItems, { product_id: '', quantity: 1, unit_price: 0, total_price: 0 }]);
  };

  const removeOrderItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index));
    }
  };

  const updateOrderItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const updatedItems = [...orderItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
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

      if (!formData.supplier_name.trim()) {
        throw new Error('Supplier name is required');
      }

      // Create purchase order with wallet transactions for USDT
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

      if (orderError) throw orderError;

      // Insert order items
      const orderItemsData = orderItems.map(item => ({
        purchase_order_id: orderData.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      // Update product stock for each item
      for (const item of orderItems) {
        const { error: updateError } = await supabase
        .from('products')
        .update({ 
          current_stock_quantity: item.quantity,
          total_purchases: item.quantity
        })
          .eq('id', item.product_id);

        if (updateError) {
          console.error('Error updating product stock:', updateError);
        }
      }

      toast({
        title: "Success",
        description: "Purchase order created successfully!",
      });

      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving purchase order:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save purchase order",
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
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading form data...</p>
            </div>
          </div>
        ) : (
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

            {/* Order Items - Simplified without warehouse */}
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
                  <div key={index} className="grid grid-cols-5 gap-4 items-end p-4 border rounded-lg">
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

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="min-w-[120px]"
              >
                {isSubmitting ? 'Creating...' : 'Create Order'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}