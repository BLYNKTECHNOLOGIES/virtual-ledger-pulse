
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUpload } from "./FileUpload";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { WarehouseSelector } from "@/components/stock/WarehouseSelector";
import { StockStatusBadge } from "@/components/stock/StockStatusBadge";
import { AlertTriangle } from "lucide-react";

interface SalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalesOrderDialog({ open, onOpenChange }: SalesOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPaymentMethodAlert, setShowPaymentMethodAlert] = useState(false);
  
  const [formData, setFormData] = useState({
    order_number: "",
    client_name: "",
    platform: "",
    product_id: "",
    warehouse_id: "",
    amount: 0,
    quantity: 1,
    price_per_unit: 0,
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: "",
    payment_status: "PENDING",
    sales_payment_method_id: "",
    description: "",
    cosmos_alert: false,
    credits_applied: 0,
  });
  
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Fetch sales payment methods
  const { data: salesPaymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name, balance)
        `)
        .eq('is_active', true)
        .order('created_at');
      
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

  const createPendingSalesOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('sales_orders')
        .insert([{
          ...orderData,
          payment_status: 'PENDING',
          status: 'AWAITING_PAYMENT',
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Order Created",
        description: "Sales order created and moved to pending status.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create sales order: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      order_number: "",
      client_name: "",
      platform: "",
      product_id: "",
      warehouse_id: "",
      amount: 0,
      quantity: 1,
      price_per_unit: 0,
      order_date: new Date().toISOString().split('T')[0],
      delivery_date: "",
      payment_status: "PENDING",
      sales_payment_method_id: "",
      description: "",
      cosmos_alert: false,
      credits_applied: 0,
    });
    setAttachmentUrls([]);
    setShowPaymentMethodAlert(false);
  };

  const handlePaymentMethodAssigned = () => {
    if (!salesPaymentMethods || salesPaymentMethods.length === 0) {
      setShowPaymentMethodAlert(true);
      return;
    }

    createPendingSalesOrderMutation.mutate(formData);
  };

  const handlePaymentMethodAlertOk = () => {
    // Cancel order - move to leads
    toast({
      title: "Order Cancelled",
      description: "Order has been cancelled and moved to leads for follow-up.",
    });
    setShowPaymentMethodAlert(false);
    resetForm();
    onOpenChange(false);
  };

  // Calculate price per unit when amount or quantity changes
  const handleAmountChange = (amount: number) => {
    setFormData(prev => ({
      ...prev,
      amount,
      price_per_unit: prev.quantity > 0 ? amount / prev.quantity : 0
    }));
  };

  const handleQuantityChange = (quantity: number) => {
    setFormData(prev => ({
      ...prev,
      quantity,
      price_per_unit: quantity > 0 ? prev.amount / quantity : 0
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Sales Order</DialogTitle>
        </DialogHeader>
        
        {showPaymentMethodAlert && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No available payment methods found. Please contact your admin to set up payment methods.
              <div className="mt-2">
                <Button onClick={handlePaymentMethodAlertOk}>
                  Okay
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!showPaymentMethodAlert && (
          <form className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
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
                  <Label htmlFor="client_name">Customer Name *</Label>
                  <CustomerAutocomplete
                    value={formData.client_name}
                    onChange={(value) => setFormData(prev => ({ ...prev, client_name: value }))}
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
                  <Select value={formData.product_id} onValueChange={(value) => setFormData(prev => ({ ...prev, product_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{product.name} ({product.code})</span>
                            <StockStatusBadge productId={product.id} className="ml-2" />
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.product_id && (
                  <div>
                    <WarehouseSelector
                      value={formData.warehouse_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, warehouse_id: value }))}
                      productId={formData.product_id}
                      showStockInfo={true}
                      label="Select Warehouse *"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Total Amount *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                    />
                  </div>
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
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="order_date">Order Date *</Label>
                    <Input
                      id="order_date"
                      type="date"
                      value={formData.order_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="delivery_date">Delivery Date</Label>
                    <Input
                      id="delivery_date"
                      type="date"
                      value={formData.delivery_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="credits_applied">Credits Applied</Label>
                  <Input
                    id="credits_applied"
                    type="number"
                    step="0.01"
                    value={formData.credits_applied}
                    onChange={(e) => setFormData(prev => ({ ...prev, credits_applied: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="cosmos_alert"
                    checked={formData.cosmos_alert}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, cosmos_alert: !!checked }))}
                  />
                  <Label htmlFor="cosmos_alert">COSMOS Alert</Label>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Enter order description..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div>
              <Label>Attachments</Label>
              <FileUpload
                onFilesUploaded={setAttachmentUrls}
                existingFiles={attachmentUrls}
              />
            </div>

            <div className="flex justify-center pt-4 border-t">
              <Button 
                type="button" 
                onClick={handlePaymentMethodAssigned}
                disabled={createPendingSalesOrderMutation.isPending}
                size="lg"
                className="w-full max-w-md"
              >
                {createPendingSalesOrderMutation.isPending ? "Processing..." : "Payment Method Assigned"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
