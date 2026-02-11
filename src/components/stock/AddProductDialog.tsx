
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { useUSDTRate } from "@/hooks/useUSDTRate";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct?: any;
  onProductSaved?: () => void;
}

export function AddProductDialog({ open, onOpenChange, editingProduct, onProductSaved }: AddProductDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    unit_of_measurement: "",
    current_stock_quantity: "0"
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: usdtRateData } = useUSDTRate();

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name || "",
        code: editingProduct.code || "",
        unit_of_measurement: editingProduct.unit_of_measurement || "",
        current_stock_quantity: editingProduct.current_stock_quantity?.toString() || "0"
      });
    } else {
      setFormData({
        name: "",
        code: "",
        unit_of_measurement: "Units",
        current_stock_quantity: "0"
      });
    }
  }, [editingProduct, open]);

  const saveProductMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Auto-calculate prices from live market rate
      const marketRate = usdtRateData?.rate || 84.5;
      const costPrice = parseFloat(marketRate.toFixed(2));
      const sellingPrice = parseFloat((costPrice * 1.05).toFixed(2));

      const productData = {
        name: data.name,
        code: data.code,
        unit_of_measurement: data.unit_of_measurement,
        cost_price: costPrice,
        selling_price: sellingPrice,
        current_stock_quantity: parseInt(data.current_stock_quantity)
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);
        
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      if (!editingProduct) {
        logActionWithCurrentUser({
          actionType: ActionTypes.STOCK_PRODUCT_CREATED,
          entityType: EntityTypes.PRODUCT,
          entityId: 'new',
          module: Modules.STOCK,
          metadata: { name: variables.name, code: variables.code }
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products_with_warehouse_stock'] });
      toast({
        title: "Success",
        description: editingProduct ? "Product updated successfully" : "Product added successfully",
      });
      onOpenChange(false);
      onProductSaved?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: editingProduct ? "Failed to update product" : "Failed to add product",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProductMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Product Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="code">Product Code</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value})}
              required
            />
          </div>

          <div>
            <Label htmlFor="unit">Unit of Measurement</Label>
            <Select value={formData.unit_of_measurement} onValueChange={(value) => setFormData({...formData, unit_of_measurement: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Units">Units</SelectItem>
                <SelectItem value="Kilograms">Kilograms</SelectItem>
                <SelectItem value="Liters">Liters</SelectItem>
                <SelectItem value="Meters">Meters</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveProductMutation.isPending}>
              {saveProductMutation.isPending ? 
                (editingProduct ? "Updating..." : "Adding...") : 
                (editingProduct ? "Update Product" : "Add Product")
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
