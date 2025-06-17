
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  cost_price: number;
  code: string;
  unit_of_measurement: string;
}

interface Warehouse {
  id: string;
  name: string;
  location: string;
}

interface ProductItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  warehouse_id?: string;
}

interface ProductSelectionSectionProps {
  products: Product[];
  warehouses: Warehouse[];
  items: ProductItem[];
  onItemsChange: (items: ProductItem[]) => void;
}

export function ProductSelectionSection({ products, warehouses, items, onItemsChange }: ProductSelectionSectionProps) {
  const addItem = () => {
    const newItem: ProductItem = {
      id: `temp-${Date.now()}`,
      product_id: "",
      quantity: 0,
      unit_price: 0,
      total_price: 0,
      warehouse_id: ""
    };
    onItemsChange([...items, newItem]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      const newItems = items.filter((_, i) => i !== index);
      onItemsChange(newItems);
    }
  };

  const updateItem = (index: number, field: keyof ProductItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Recalculate total price when quantity or unit price changes
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total_price = newItems[index].quantity * newItems[index].unit_price;
    }
    
    onItemsChange(newItems);
  };

  const getProductById = (productId: string) => {
    return products.find(p => p.id === productId);
  };

  // Add initial item if none exist
  if (items.length === 0) {
    const initialItem: ProductItem = {
      id: `temp-${Date.now()}`,
      product_id: "",
      quantity: 0,
      unit_price: 0,
      total_price: 0,
      warehouse_id: ""
    };
    onItemsChange([initialItem]);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Product Items</CardTitle>
          <Button type="button" onClick={addItem} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => {
          const selectedProduct = getProductById(item.product_id);
          
          return (
            <div key={item.id} className="border rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label>Product *</Label>
                  <Select 
                    value={item.product_id} 
                    onValueChange={(value) => {
                      updateItem(index, 'product_id', value);
                      const product = getProductById(value);
                      if (product) {
                        updateItem(index, 'unit_price', product.cost_price);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({product.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Warehouse</Label>
                  <Select 
                    value={item.warehouse_id || ""} 
                    onValueChange={(value) => updateItem(index, 'warehouse_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
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
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity || ""}
                    onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="Enter quantity"
                  />
                </div>

                <div>
                  <Label>Unit Price *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price || ""}
                    onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    placeholder="Enter price"
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

              {selectedProduct && (
                <div className="text-sm text-gray-600">
                  <p>Product Code: {selectedProduct.code}</p>
                  <p>Unit: {selectedProduct.unit_of_measurement}</p>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-gray-600">Item Total:</span>
                <span className="font-medium">₹{item.total_price.toFixed(2)}</span>
              </div>
            </div>
          );
        })}

        <div className="flex justify-end pt-4 border-t">
          <div className="text-right">
            <span className="text-lg font-bold">
              Grand Total: ₹{items.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
