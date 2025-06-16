
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUpload } from "./FileUpload";

interface FinalSalesEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderData: {
    clientName: string;
    amount: number;
    paymentMethod: any;
    platform?: string;
  };
}

export function FinalSalesEntryDialog({ 
  open, 
  onOpenChange, 
  orderData 
}: FinalSalesEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    orderNumber: "",
    quantity: 1,
    pricePerUnit: orderData.amount,
    orderDate: new Date().toISOString().split('T')[0],
    orderTime: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
    description: "",
    creditsApplied: 0,
    attachmentUrls: [] as string[]
  });

  // Auto-calculate price per unit when quantity changes
  const handleQuantityChange = (quantity: number) => {
    const newPricePerUnit = quantity > 0 ? orderData.amount / quantity : orderData.amount;
    setFormData(prev => ({
      ...prev,
      quantity,
      pricePerUnit: newPricePerUnit
    }));
  };

  const createFinalSalesMutation = useMutation({
    mutationFn: async (salesData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('sales_orders')
        .insert([{
          order_number: salesData.orderNumber,
          client_name: orderData.clientName,
          platform: orderData.platform,
          amount: orderData.amount,
          quantity: salesData.quantity,
          price_per_unit: salesData.pricePerUnit,
          order_date: salesData.orderDate,
          payment_status: 'COMPLETED',
          status: 'DELIVERED',
          sales_payment_method_id: orderData.paymentMethod.id,
          description: salesData.description,
          credits_applied: salesData.creditsApplied,
          attachment_urls: salesData.attachmentUrls.length > 0 ? salesData.attachmentUrls : null,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      // Update payment method usage
      const newUsage = (orderData.paymentMethod.current_usage || 0) + orderData.amount;
      await supabase
        .from('sales_payment_methods')
        .update({ current_usage: newUsage })
        .eq('id', orderData.paymentMethod.id);

      // Update bank account balance if it's a bank transfer
      if (orderData.paymentMethod.type === 'Bank Account' && orderData.paymentMethod.bank_account_id) {
        const { data: bankAccount } = await supabase
          .from('bank_accounts')
          .select('balance')
          .eq('id', orderData.paymentMethod.bank_account_id)
          .single();
          
        if (bankAccount) {
          await supabase
            .from('bank_accounts')
            .update({ 
              balance: bankAccount.balance + orderData.amount 
            })
            .eq('id', orderData.paymentMethod.bank_account_id);
        }
      }

      // Update client monthly usage - fixed syntax
      const { data: currentClient } = await supabase
        .from('clients')
        .select('current_month_used')
        .eq('name', orderData.clientName)
        .single();

      if (currentClient) {
        await supabase
          .from('clients')
          .update({ 
            current_month_used: (currentClient.current_month_used || 0) + orderData.amount
          })
          .eq('name', orderData.clientName);
      }

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Sales Entry Completed",
        description: "Sales order has been successfully recorded with payment confirmation.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create sales entry: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createFinalSalesMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Sales Entry</DialogTitle>
          <p className="text-gray-600">Payment received - finalize the sales record</p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="orderNumber">Order Number *</Label>
              <Input
                id="orderNumber"
                value={formData.orderNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                placeholder="Enter platform order number"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pricePerUnit">Price per Unit *</Label>
              <Input
                id="pricePerUnit"
                type="number"
                step="0.01"
                value={formData.pricePerUnit.toFixed(2)}
                onChange={(e) => setFormData(prev => ({ ...prev, pricePerUnit: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="totalAmount">Total Amount</Label>
              <Input
                id="totalAmount"
                value={`₹${orderData.amount.toFixed(2)}`}
                readOnly
                className="bg-gray-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="orderDate">Order Date *</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) => setFormData(prev => ({ ...prev, orderDate: e.target.value }))}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="orderTime">Order Time *</Label>
              <Input
                id="orderTime"
                type="time"
                value={formData.orderTime}
                onChange={(e) => setFormData(prev => ({ ...prev, orderTime: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="creditsApplied">Credits Applied</Label>
            <Input
              id="creditsApplied"
              type="number"
              step="0.01"
              value={formData.creditsApplied}
              onChange={(e) => setFormData(prev => ({ ...prev, creditsApplied: parseFloat(e.target.value) || 0 }))}
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter order description or notes..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div>
            <Label>Upload Documents</Label>
            <FileUpload
              onFilesUploaded={(urls) => setFormData(prev => ({ ...prev, attachmentUrls: urls }))}
              existingFiles={formData.attachmentUrls}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createFinalSalesMutation.isPending}>
              {createFinalSalesMutation.isPending ? "Completing..." : "Complete Sales Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
