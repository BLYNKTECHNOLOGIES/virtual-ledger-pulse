
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

  const addItem = () => {
    const newItem: ProductItem = {
      id: Date.now().toString(),
      product_id: "",
      quantity: 0,
      unit_price: 0,
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label>Product *</Label>
                <Select 
                  value={item.product_id} 
                  onValueChange={(value) => updateItem(index, 'product_id', value)}
                >
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
                <Label>Warehouse *</Label>
                <Select 
                  value={item.warehouse_id} 
                  onValueChange={(value) => updateItem(index, 'warehouse_id', value)}
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
                <Label>Quantity *</Label>
                <Input
                  type="text"
                  value={item.quantity === 0 ? '' : item.quantity.toString()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      updateItem(index, 'quantity', value === '' ? 0 : parseFloat(value) || 0);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Unit Price *</Label>
                <Input
                  type="text"
                  value={item.unit_price === 0 ? '' : item.unit_price.toString()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      updateItem(index, 'unit_price', value === '' ? 0 : parseFloat(value) || 0);
                    }
                  }}
                  placeholder="0.00"
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
          Grand Total: ₹{items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
