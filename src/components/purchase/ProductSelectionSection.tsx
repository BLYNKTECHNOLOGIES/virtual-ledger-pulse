
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

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

  const addNewItem = () => {
    // Only allow one item
    if (items.length > 0) return;
    
    const newItem: ProductItem = {
      id: Date.now().toString(),
      product_id: '',
      quantity: 0,
      unit_price: 0,
      warehouse_id: ''
    };
    onItemsChange([newItem]);
  };

  const updateItem = (id: string, field: keyof ProductItem, value: any) => {
    const updatedItems = items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        
        // Auto-fill unit price when product is selected
        if (field === 'product_id' && value) {
          const selectedProduct = products?.find(p => p.id === value);
          if (selectedProduct) {
            updatedItem.unit_price = selectedProduct.cost_price;
          }
        }
        
        return updatedItem;
      }
      return item;
    });
    onItemsChange(updatedItems);
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter(item => item.id !== id));
  };

  const getTotalAmount = () => {
    return items.reduce((total, item) => total + (item.quantity * item.unit_price), 0);
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex justify-between items-center">
        <Label className="text-lg font-semibold">Product Item</Label>
        {items.length === 0 && (
          <Button type="button" onClick={addNewItem} variant="outline" size="sm">
            Add Product
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Click "Add Product" to select a product for this purchase order
        </div>
      )}

      {items.map((item) => {
        const selectedProduct = products?.find(p => p.id === item.product_id);
        
        return (
          <div key={item.id} className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border rounded-lg">
            <div>
              <Label>Product</Label>
              <Select onValueChange={(value) => updateItem(item.id, 'product_id', value)}>
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
              <Label>Warehouse</Label>
              <Select onValueChange={(value) => updateItem(item.id, 'warehouse_id', value)}>
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
              <Label>Unit Price</Label>
              <Input
                type="number"
                step="0.01"
                value={item.unit_price}
                onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                step="0.01"
                value={item.quantity}
                onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label>Total</Label>
              <Input
                value={(item.quantity * item.unit_price).toFixed(2)}
                readOnly
                className="bg-gray-50"
              />
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeItem(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {selectedProduct && (
              <div className="md:col-span-6 text-sm text-gray-600">
                Current Stock: {selectedProduct.current_stock_quantity} {selectedProduct.unit_of_measurement}
              </div>
            )}
          </div>
        );
      })}

      {items.length > 0 && (
        <div className="flex justify-end">
          <div className="text-lg font-semibold">
            Total Amount: ₹{getTotalAmount().toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
