
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    category: "",
    unit_of_measurement: "",
    cost_price: "",
    selling_price: "",
    reorder_level: "",
    current_stock_quantity: "0"
  });

  const queryClient = useQueryClient();

  const addProductMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('products')
        .insert([{
          ...data,
          cost_price: parseFloat(data.cost_price),
          selling_price: parseFloat(data.selling_price),
          reorder_level: parseInt(data.reorder_level),
          current_stock_quantity: parseInt(data.current_stock_quantity)
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: "Success",
        description: "Product added successfully",
      });
      onOpenChange(false);
      setFormData({
        name: "",
        code: "",
        category: "",
        unit_of_measurement: "",
        cost_price: "",
        selling_price: "",
        reorder_level: "",
        current_stock_quantity: "0"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add product",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addProductMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
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
            <Label htmlFor="category">Category</Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Electronics">Electronics</SelectItem>
                <SelectItem value="Apparel">Apparel</SelectItem>
                <SelectItem value="Food">Food</SelectItem>
                <SelectItem value="Books">Books</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="unit">Unit of Measurement</Label>
            <Select value={formData.unit_of_measurement} onValueChange={(value) => setFormData({...formData, unit_of_measurement: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pieces">Pieces</SelectItem>
                <SelectItem value="Kilograms">Kilograms</SelectItem>
                <SelectItem value="Liters">Liters</SelectItem>
                <SelectItem value="Meters">Meters</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cost_price">Cost Price</Label>
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                value={formData.cost_price}
                onChange={(e) => setFormData({...formData, cost_price: e.target.value})}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="selling_price">Selling Price</Label>
              <Input
                id="selling_price"
                type="number"
                step="0.01"
                value={formData.selling_price}
                onChange={(e) => setFormData({...formData, selling_price: e.target.value})}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="reorder_level">Reorder Level</Label>
            <Input
              id="reorder_level"
              type="number"
              value={formData.reorder_level}
              onChange={(e) => setFormData({...formData, reorder_level: e.target.value})}
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addProductMutation.isPending}>
              {addProductMutation.isPending ? "Adding..." : "Add Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
