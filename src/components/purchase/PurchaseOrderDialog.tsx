
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
  warehouse_id: string;
}

export function PurchaseOrderDialog({ open, onOpenChange }: PurchaseOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    order_number: "",
    supplier_name: "",
    bank_account_id: "",
    order_date: new Date().toISOString().split('T')[0],
    description: "",
  });
  
  const [items, setItems] = useState<PurchaseItem[]>([
    { product_id: "", quantity: 0, unit_price: 0, warehouse_id: "" }
  ]);

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
          bank_account_id: purchaseData.bank_account_id,
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
        total_price: item.quantity * item.unit_price,
        warehouse_id: item.warehouse_id
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
      }

      // Update bank account balance (reduce balance)
      if (purchaseData.bank_account_id) {
        const { data: bankAccount } = await supabase
          .from('bank_accounts')
          .select('balance')
          .eq('id', purchaseData.bank_account_id)
          .single();
          
        if (bankAccount) {
          await supabase
            .from('bank_accounts')
            .update({ 
              balance: bankAccount.balance - totalAmount 
            })
            .eq('id', purchaseData.bank_account_id);
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
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
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
      bank_account_id: "",
      order_date: new Date().toISOString().split('T')[0],
      description: "",
    });
    setItems([{ product_id: "", quantity: 0, unit_price: 0, warehouse_id: "" }]);
  };

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 0, unit_price: 0, warehouse_id: "" }]);
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
    createPurchaseOrderMutation.mutate(formData);
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

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
                <Label htmlFor="bank_account_id">Bank Account</Label>
                <Select onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.account_name} - {account.bank_name}
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
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                      <Label>Warehouse</Label>
                      <Select onValueChange={(value) => updateItem(index, 'warehouse_id', value)}>
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
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                      />
                    </div>

                    <div>
                      <Label>Unit Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
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
