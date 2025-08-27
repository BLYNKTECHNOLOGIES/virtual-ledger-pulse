
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

interface PurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PurchaseItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export function PurchaseOrderDialog({ open, onOpenChange }: PurchaseOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    order_number: "",
    supplier_name: "",
    purchase_payment_method_id: "",
    order_date: new Date().toISOString().split('T')[0],
    description: "",
  });
  
  const [items, setItems] = useState<PurchaseItem[]>([
    { product_id: "", quantity: undefined as any, unit_price: undefined as any }
  ]);

  // Fetch purchase payment methods with bank account details
  const { data: purchasePaymentMethods } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select(`
          *,
          upi_id,
          bank_accounts!purchase_payment_methods_bank_account_name_fkey(account_name, bank_name, balance)
        `)
        .eq('is_active', true)
        .order('created_at');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch products
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


  const createPurchaseOrderMutation = useMutation({
    mutationFn: async (purchaseData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      
      // Create purchase order
      const { data: purchaseOrder, error: purchaseError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: purchaseData.order_number,
          supplier_name: purchaseData.supplier_name,
          purchase_payment_method_id: purchaseData.purchase_payment_method_id,
          total_amount: totalAmount,
          order_date: purchaseData.order_date,
          description: purchaseData.description,
          created_by: user?.id,
          status: 'COMPLETED'
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      // Create purchase order items
      const itemsData = items.map(item => ({
        purchase_order_id: purchaseOrder.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(itemsData);

      if (itemsError) throw itemsError;

      // Update product stock quantities manually
      for (const item of items) {
        const { data: product } = await supabase
          .from('products')
          .select('current_stock_quantity')
          .eq('id', item.product_id)
          .single();
          
        if (product) {
          await supabase
            .from('products')
            .update({ 
              current_stock_quantity: product.current_stock_quantity + item.quantity 
            })
            .eq('id', item.product_id);
        }

        // Add stock transaction record
        await supabase
          .from('stock_transactions')
          .insert({
            product_id: item.product_id,
            transaction_type: 'PURCHASE',
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.quantity * item.unit_price,
            transaction_date: purchaseData.order_date,
            reference_number: purchaseData.order_number,
            supplier_customer_name: purchaseData.supplier_name
          });
      }

      // Update payment method usage if provided
      if (purchaseData.purchase_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('purchase_payment_methods')
          .select('current_usage')
          .eq('id', purchaseData.purchase_payment_method_id)
          .single();
          
        if (paymentMethod) {
          await supabase
            .from('purchase_payment_methods')
            .update({ 
              current_usage: paymentMethod.current_usage + totalAmount 
            })
            .eq('id', purchaseData.purchase_payment_method_id);
        }

        // Create bank EXPENSE transaction so balance updates via triggers
        const { data: pm } = await supabase
          .from('purchase_payment_methods')
          .select('bank_account_name')
          .eq('id', purchaseData.purchase_payment_method_id)
          .maybeSingle();

        let bankAccountId: string | null = null;

        if (pm?.bank_account_name) {
          const { data: bank } = await supabase
            .from('bank_accounts')
            .select('id')
            .eq('account_name', pm.bank_account_name)
            .maybeSingle();
          bankAccountId = bank?.id || null;
        }
        
        if (bankAccountId) {
          await supabase
            .from('bank_transactions')
            .insert({
              bank_account_id: bankAccountId,
              transaction_type: 'EXPENSE',
              amount: totalAmount,
              transaction_date: purchaseData.order_date,
              category: 'Purchase',
              description: `Stock Purchase - ${purchaseData.supplier_name} - Order #${purchaseData.order_number}`,
              reference_number: purchaseData.order_number,
              related_account_name: purchaseData.supplier_name,
            });
        }
      }

      return purchaseOrder;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Order Created",
        description: "Purchase order has been successfully created and stock updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
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
      order_number: "",
      supplier_name: "",
      purchase_payment_method_id: "",
      order_date: new Date().toISOString().split('T')[0],
      description: "",
    });
    setItems([{ product_id: "", quantity: undefined as any, unit_price: undefined as any }]);
  };

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: undefined as any, unit_price: undefined as any }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setItems(updatedItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.order_number || !formData.supplier_name) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Validate items
    const validItems = items.filter(item => 
      item.product_id && 
      item.quantity > 0 && 
      item.unit_price > 0
    );

    if (validItems.length === 0) {
      toast({
        title: "Validation Error", 
        description: "Please add at least one valid item with product, quantity, and unit price",
        variant: "destructive",
      });
      return;
    }

    // Update items to only include valid ones
    setItems(validItems);
    
    console.log("Submitting purchase order with data:", formData);
    console.log("Valid items:", validItems);
    
    createPurchaseOrderMutation.mutate(formData);
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const getAvailableLimit = (methodId: string) => {
    const method = purchasePaymentMethods?.find(m => m.id === methodId);
    if (!method) return 0;
    return method.payment_limit - (method.current_usage || 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Purchase Order</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="order_number">Purchase Order Number *</Label>
                <Input
                  id="order_number"
                  value={formData.order_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="supplier_name">Supplier Name *</Label>
                <Input
                  id="supplier_name"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="purchase_payment_method_id">Payment Method</Label>
                <Select onValueChange={(value) => setFormData(prev => ({ ...prev, purchase_payment_method_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchasePaymentMethods?.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        <div className="flex flex-col">
                          <span>
                            {method.type === 'UPI' && method.upi_id 
                              ? method.upi_id 
                              : method.bank_account_name || 'Unnamed Method'
                            }
                          </span>
                          <span className="text-xs text-gray-500">
                            Available: ₹{getAvailableLimit(method.id).toLocaleString()} / ₹{method.payment_limit.toLocaleString()}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="order_date">Order Date *</Label>
                <Input
                  id="order_date"
                  type="date"
                  value={formData.order_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter order description..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <Label className="text-lg font-semibold">Order Items</Label>
              <Button type="button" onClick={addItem} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label>Product</Label>
                      <Select onValueChange={(value) => updateItem(index, 'product_id', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>


                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        value={item.quantity || ""}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value === "" ? undefined : parseInt(e.target.value) || 0)}
                      />
                    </div>

                    <div>
                      <Label>Unit Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_price || ""}
                        onChange={(e) => updateItem(index, 'unit_price', e.target.value === "" ? undefined : parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        onClick={() => removeItem(index)}
                        variant="destructive"
                        size="sm"
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="font-medium">Total: ₹{(item.quantity * item.unit_price).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-right">
              <div className="text-xl font-bold">
                Grand Total: ₹{totalAmount.toFixed(2)}
              </div>
              {formData.purchase_payment_method_id && (
                <div className="text-sm text-gray-600">
                  Available Limit: ₹{getAvailableLimit(formData.purchase_payment_method_id).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
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
