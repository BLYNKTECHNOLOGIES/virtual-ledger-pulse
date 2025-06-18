
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface EditSalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function EditSalesOrderDialog({ open, onOpenChange, order }: EditSalesOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    order_number: '',
    client_name: '',
    client_phone: '',
    platform: '',
    quantity: 1,
    price_per_unit: 0,
    total_amount: 0,
    payment_status: 'COMPLETED',
    order_date: '',
    description: ''
  });

  useEffect(() => {
    if (order) {
      setFormData({
        order_number: order.order_number || '',
        client_name: order.client_name || '',
        client_phone: order.client_phone || '',
        platform: order.platform || '',
        quantity: order.quantity || 1,
        price_per_unit: order.price_per_unit || 0,
        total_amount: order.total_amount || 0,
        payment_status: order.payment_status || 'COMPLETED',
        order_date: order.order_date || '',
        description: order.description || ''
      });
    }
  }, [order]);

  const updateSalesOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: result, error } = await supabase
        .from('sales_orders')
        .update({
          order_number: data.order_number,
          client_name: data.client_name,
          client_phone: data.client_phone,
          platform: data.platform,
          quantity: data.quantity,
          price_per_unit: data.price_per_unit,
          total_amount: data.total_amount,
          payment_status: data.payment_status,
          order_date: data.order_date,
          description: data.description,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales order updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error updating sales order:', error);
      toast({ title: "Error", description: "Failed to update sales order", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSalesOrderMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate total amount when quantity or price changes
      if (field === 'quantity' || field === 'price_per_unit') {
        updated.total_amount = updated.quantity * updated.price_per_unit;
      }
      
      return updated;
    });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Sales Order - {order.order_number}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Order Number *</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => handleInputChange('order_number', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Customer Name *</Label>
              <Input
                value={formData.client_name}
                onChange={(e) => handleInputChange('client_name', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Customer Phone</Label>
              <Input
                value={formData.client_phone}
                onChange={(e) => handleInputChange('client_phone', e.target.value)}
              />
            </div>

            <div>
              <Label>Platform</Label>
              <Input
                value={formData.platform}
                onChange={(e) => handleInputChange('platform', e.target.value)}
              />
            </div>

            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label>Price Per Unit *</Label>
              <Input
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', parseFloat(e.target.value) || 0)}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label>Total Amount</Label>
              <Input
                type="number"
                value={formData.total_amount}
                disabled
                className="bg-gray-100"
              />
            </div>

            <div>
              <Label>Payment Status</Label>
              <Select
                value={formData.payment_status}
                onValueChange={(value) => handleInputChange('payment_status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Order Date</Label>
              <Input
                type="date"
                value={formData.order_date}
                onChange={(e) => handleInputChange('order_date', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={updateSalesOrderMutation.isPending}
            >
              {updateSalesOrderMutation.isPending ? "Updating..." : "Update Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
