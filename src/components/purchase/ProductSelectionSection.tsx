
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";

interface ProductItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  warehouse_id: string;
  total_amount?: number;
}

interface ProductSelectionSectionProps {
  items: ProductItem[];
  onItemsChange: (items: ProductItem[]) => void;
}

export function ProductSelectionSection({ items, onItemsChange }: ProductSelectionSectionProps) {
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

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (error) throw error;
      return data;
    },
  });

  const addItem = () => {
    const newItem: ProductItem = {
      id: Date.now().toString(),
      product_id: "",
      quantity: undefined as any,
      unit_price: undefined as any,
      warehouse_id: ""
    };
    onItemsChange([...items, newItem]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      const updatedItems = items.filter((_, i) => i !== index);
      onItemsChange(updatedItems);
    }
  };

  const updateItem = (index: number, field: keyof ProductItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    onItemsChange(updatedItems);
  };

  const updateItemWithTotal = (index: number, field: keyof ProductItem, value: any, totalAmount: number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value, total_amount: totalAmount } as any;
    onItemsChange(updatedItems);
  };

  const updateItemWithQuantityFromTotal = (index: number, totalAmount: number, quantity: number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], quantity: quantity, total_amount: totalAmount } as any;
    onItemsChange(updatedItems);
  };

  const updateItemTotal = (index: number, totalAmount: number | undefined) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], total_amount: totalAmount } as any;
    onItemsChange(updatedItems);
  };

  // Initialize with one item if empty
  if (items.length === 0) {
    onItemsChange([{
      id: Date.now().toString(),
      product_id: "",
      quantity: 0,
      unit_price: 0,
      warehouse_id: ""
    }]);
  }

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex justify-between items-center">
        <Label className="text-lg font-semibold">Product Items</Label>
        <Button type="button" onClick={addItem} variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={item.id} className="border rounded-lg p-4">
            {/* Two rows layout for better readability */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Product *</Label>
                <Select 
                  value={item.product_id} 
                  onValueChange={(value) => updateItem(index, 'product_id', value)}
                >
                  <SelectTrigger className="w-full">
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
                <Label>Wallet *</Label>
                <Select 
                  value={item.warehouse_id} 
                  onValueChange={(value) => updateItem(index, 'warehouse_id', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets?.map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.wallet_name} ({wallet.wallet_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.quantity || ""}
                  onChange={(e) => {
                    const value = e.target.value === "" ? undefined : parseFloat(e.target.value) || 0;
                    updateItem(index, 'quantity', value);
                    // Auto-calculate total amount if unit price exists
                    if (item.unit_price && value) {
                      const totalAmount = value * item.unit_price;
                      updateItemWithTotal(index, 'quantity', value, totalAmount);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Unit Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.unit_price || ""}
                  onChange={(e) => {
                    const value = e.target.value === "" ? undefined : parseFloat(e.target.value) || 0;
                    updateItem(index, 'unit_price', value);
                    // Auto-calculate total amount if quantity exists
                    if (item.quantity && value) {
                      const totalAmount = item.quantity * value;
                      updateItemWithTotal(index, 'unit_price', value, totalAmount);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Total Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(item as any).total_amount || ""}
                  onChange={(e) => {
                    const totalAmount = e.target.value === "" ? undefined : parseFloat(e.target.value) || 0;
                    // Auto-calculate quantity if unit price exists
                    if (item.unit_price && totalAmount) {
                      const calculatedQuantity = totalAmount / item.unit_price;
                      updateItemWithQuantityFromTotal(index, totalAmount, calculatedQuantity);
                    } else {
                      updateItemTotal(index, totalAmount);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>

              <div className="flex justify-end">
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
          </div>
        ))}
      </div>

      <div className="mt-4 text-right">
        <div className="text-xl font-bold">
          Grand Total: ₹{items.reduce((sum, item) => sum + ((item as any).total_amount || (item.quantity * item.unit_price) || 0), 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
