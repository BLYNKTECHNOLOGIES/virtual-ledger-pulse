import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Package, Warehouse } from "lucide-react";

interface OrderCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterpartyName: string;
  orderAmount: number;
  paymentMethodId: string;
  kycId: string;
  onOrderCompleted?: () => void;
}

interface OrderFormData {
  order_number: string;
  platform: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  price_per_unit: number;
  description: string;
  risk_level: string;
}

export function OrderCompletionDialog({ 
  open, 
  onOpenChange, 
  counterpartyName,
  orderAmount,
  paymentMethodId,
  kycId,
  onOrderCompleted
}: OrderCompletionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Generate unique order number
  const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const counter = Math.floor(Math.random() * 1000);
    return `KYC-${timestamp}-${random}-${counter}`;
  };

  const [formData, setFormData] = useState<OrderFormData>({
    order_number: generateOrderNumber(),
    platform: "",
    product_id: "",
    warehouse_id: "",
    quantity: 1,
    price_per_unit: orderAmount,
    description: `KYC Order - ${counterpartyName}`,
    risk_level: "MEDIUM"
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Fetch warehouses
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Fetch platforms
  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const createSalesOrderMutation = useMutation({
    mutationFn: async (orderData: OrderFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create sales order
      const { data: salesOrder, error: salesError } = await supabase
        .from('sales_orders')
        .insert({
          order_number: orderData.order_number,
          client_name: counterpartyName,
          platform: orderData.platform,
          product_id: orderData.product_id || null,
          warehouse_id: orderData.warehouse_id || null,
          quantity: orderData.quantity,
          price_per_unit: orderData.price_per_unit,
          total_amount: orderAmount,
          sales_payment_method_id: paymentMethodId,
          payment_status: "COMPLETED",
          status: "COMPLETED",
          order_date: new Date().toISOString().split('T')[0],
          description: orderData.description,
          risk_level: orderData.risk_level,
          created_by: user?.id,
        })
        .select()
        .single();

      if (salesError) throw salesError;

      // Update KYC status to completed
      const { error: kycError } = await supabase
        .from('kyc_approval_requests')
        .update({ 
          status: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .eq('id', kycId);

      if (kycError) throw kycError;

      // Update payment method usage
      const { data: paymentMethod } = await supabase
        .from('sales_payment_methods')
        .select('current_usage')
        .eq('id', paymentMethodId)
        .single();
        
      if (paymentMethod) {
        await supabase
          .from('sales_payment_methods')
          .update({ 
            current_usage: paymentMethod.current_usage + orderAmount 
          })
          .eq('id', paymentMethodId);
      }

      // Update bank account balance only if NOT a payment gateway
      const { data: paymentMethodWithBank } = await supabase
        .from('sales_payment_methods')
        .select('bank_account_id, payment_gateway')
        .eq('id', paymentMethodId)
        .single();

      if (paymentMethodWithBank?.bank_account_id && !paymentMethodWithBank?.payment_gateway) {
        const { data: bankAccount } = await supabase
          .from('bank_accounts')
          .select('balance')
          .eq('id', paymentMethodWithBank.bank_account_id)
          .single();
          
        if (bankAccount) {
          await supabase
            .from('bank_accounts')
            .update({ 
              balance: bankAccount.balance + orderAmount 
            })
            .eq('id', paymentMethodWithBank.bank_account_id);
        }
      }

      return salesOrder;
    },
    onSuccess: () => {
      toast({
        title: "Order Completed Successfully",
        description: "Sales order has been created and KYC marked as completed.",
      });
      queryClient.invalidateQueries({ queryKey: ['approved_kyc_requests'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      onOrderCompleted?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to complete order: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSalesOrderMutation.mutate(formData);
  };

  const handleQuantityChange = (quantity: number) => {
    setFormData(prev => ({
      ...prev,
      quantity,
      price_per_unit: quantity > 0 ? orderAmount / quantity : orderAmount
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Complete Order - {counterpartyName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>Payment Completed:</strong> ₹{orderAmount.toLocaleString()}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="order_number">Order Number *</Label>
              <Input
                id="order_number"
                value={formData.order_number}
                onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label htmlFor="platform">Platform</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, platform: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {platforms?.map((platform) => (
                    <SelectItem key={platform.id} value={platform.name}>
                      {platform.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="product_id">Product</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, product_id: value }))}>
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
              <Label htmlFor="warehouse_id">Warehouse</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, warehouse_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      <Warehouse className="h-4 w-4 mr-2 inline" />
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div>
              <Label htmlFor="price_per_unit">Price per Unit</Label>
              <Input
                id="price_per_unit"
                type="number"
                step="0.01"
                value={formData.price_per_unit.toFixed(2)}
                readOnly
                className="bg-gray-100"
              />
            </div>

            <div>
              <Label htmlFor="risk_level">Risk Level</Label>
              <Select 
                value={formData.risk_level}
                onValueChange={(value) => setFormData(prev => ({ ...prev, risk_level: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low Risk</SelectItem>
                  <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                  <SelectItem value="HIGH">High Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createSalesOrderMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {createSalesOrderMutation.isPending ? "Completing..." : "Complete Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}