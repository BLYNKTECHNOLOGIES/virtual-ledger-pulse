
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function OrderStatusDialog({ open, onOpenChange, order }: OrderStatusDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ status, paymentStatus }: { status: string; paymentStatus: string }) => {
      const { data, error } = await supabase
        .from('sales_orders')
        .update({
          status: status,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update order status: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const moveToLeadsMutation = useMutation({
    mutationFn: async () => {
      // First create lead entry
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: leadError } = await supabase
        .from('leads')
        .insert({
          name: order.client_name,
          contact_number: order.client_phone,
          description: `Cancelled order: ${order.order_number} - ${order.description}`,
          estimated_order_value: order.total_amount,
          status: 'NEW',
          source: 'Cancelled Order'
        });

      if (leadError) throw leadError;

      // Then delete the order
      const { error: deleteError } = await supabase
        .from('sales_orders')
        .delete()
        .eq('id', order.id);

      if (deleteError) throw deleteError;
      
      return true;
    },
    onSuccess: () => {
      toast({
        title: "Order Cancelled",
        description: "Order has been cancelled and moved to leads for follow-up.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to cancel order: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const handlePaymentReceived = () => {
    updateOrderStatusMutation.mutate({
      status: 'COMPLETED',
      paymentStatus: 'COMPLETED'
    });
    toast({
      title: "Payment Received",
      description: "Order marked as completed with payment received.",
    });
  };

  const handleChangePaymentMethod = () => {
    updateOrderStatusMutation.mutate({
      status: 'AWAITING_PAYMENT',
      paymentStatus: 'PENDING'
    });
    toast({
      title: "Payment Method Changed",
      description: "Order status updated to awaiting payment.",
    });
  };

  const handleCancelled = () => {
    moveToLeadsMutation.mutate();
  };

  const handlePaymentMethodAssigned = () => {
    updateOrderStatusMutation.mutate({
      status: 'AWAITING_PAYMENT',
      paymentStatus: 'PENDING'
    });
    toast({
      title: "Payment Method Assigned",
      description: "Order is now awaiting payment.",
    });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Order Status - {order.order_number}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-gray-600 mb-4">
            Current Status: <span className="font-medium">{order.status}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            <Button 
              onClick={handlePaymentReceived}
              disabled={updateOrderStatusMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              Payment Received
            </Button>
            
            <Button 
              onClick={handleChangePaymentMethod}
              disabled={updateOrderStatusMutation.isPending}
              variant="outline"
            >
              Change Payment Method
            </Button>
            
            <Button 
              onClick={handleCancelled}
              disabled={moveToLeadsMutation.isPending}
              variant="destructive"
            >
              Cancelled
            </Button>
            
            <Button 
              onClick={handlePaymentMethodAssigned}
              disabled={updateOrderStatusMutation.isPending}
              variant="secondary"
            >
              Payment Method Assigned
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
