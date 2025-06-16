import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { FileUpload } from "./FileUpload";

interface SalesEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SalesEntryForm {
  customerName: string;
  orderNumber: string;
  productId: string;
  quantity: number;
  sellingPrice: number;
  bankAccountId: string;
  orderDate: string;
  description: string;
  riskLevel: string;
  attachmentUrls: string[];
}

export function SalesEntryDialog({ open, onOpenChange }: SalesEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<SalesEntryForm>({
    customerName: "",
    orderNumber: "",
    productId: "",
    quantity: 0,
    sellingPrice: 0,
    bankAccountId: "",
    orderDate: new Date().toISOString().split('T')[0],
    description: "",
    riskLevel: "",
    attachmentUrls: []
  });

  // Fetch products from stock management
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .gt('current_stock_quantity', 0);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch active bank accounts from BAMS
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE');
      
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find(p => p.id === formData.productId);
  const totalAmount = formData.quantity * formData.sellingPrice;

  const createSalesMutation = useMutation({
    mutationFn: async (salesData: SalesEntryForm) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Check if customer exists or create new one
      let clientExists = true;
      const { data: existingClient, error: clientCheckError } = await supabase
        .from('clients')
        .select('*')
        .ilike('name', salesData.customerName)
        .single();

      if (clientCheckError && clientCheckError.code === 'PGRST116') {
        // Client doesn't exist, create new one
        clientExists = false;
        const { error: newClientError } = await supabase
          .from('clients')
          .insert({
            client_id: `CLI${Date.now()}`,
            name: salesData.customerName,
            date_of_onboarding: salesData.orderDate,
            risk_appetite: salesData.riskLevel,
            client_type: 'RETAIL',
            first_order_value: totalAmount,
            current_month_used: totalAmount
          });

        if (newClientError) throw newClientError;
      }

      // 2. Create sales order
      const { data: salesOrder, error: salesError } = await supabase
        .from('sales_orders')
        .insert({
          order_number: salesData.orderNumber,
          client_name: salesData.customerName,
          amount: totalAmount,
          order_date: salesData.orderDate,
          payment_status: 'COMPLETED',
          status: 'DELIVERED',
          description: salesData.description,
          attachment_urls: salesData.attachmentUrls,
          risk_level: salesData.riskLevel,
          created_by: user?.id
        })
        .select()
        .single();

      if (salesError) throw salesError;

      // 3. Create stock out transaction
      const { error: stockError } = await supabase
        .from('stock_transactions')
        .insert({
          product_id: salesData.productId,
          transaction_type: 'OUT',
          quantity: salesData.quantity,
          unit_price: salesData.sellingPrice,
          total_amount: totalAmount,
          reference_number: salesData.orderNumber,
          supplier_customer_name: salesData.customerName,
          transaction_date: salesData.orderDate,
          reason: 'Sales'
        });

      if (stockError) throw stockError;

      // 4. Update product stock quantity
      if (selectedProduct) {
        const newStockQuantity = selectedProduct.current_stock_quantity - salesData.quantity;
        const { error: updateError } = await supabase
          .from('products')
          .update({ current_stock_quantity: newStockQuantity })
          .eq('id', salesData.productId);

        if (updateError) throw updateError;
      }

      return salesOrder;
    },
    onSuccess: () => {
      toast({
        title: "Sales Entry Created",
        description: "Sales order has been successfully created with all details and attachments.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create sales entry: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      customerName: "",
      orderNumber: "",
      productId: "",
      quantity: 0,
      sellingPrice: 0,
      bankAccountId: "",
      orderDate: new Date().toISOString().split('T')[0],
      description: "",
      riskLevel: "",
      attachmentUrls: []
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProduct) {
      toast({
        title: "Error",
        description: "Please select a product",
        variant: "destructive",
      });
      return;
    }

    if (formData.quantity > selectedProduct.current_stock_quantity) {
      toast({
        title: "Error",
        description: `Insufficient stock. Available: ${selectedProduct.current_stock_quantity}`,
        variant: "destructive",
      });
      return;
    }

    createSalesMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Sales Entry</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <CustomerAutocomplete
                value={formData.customerName}
                onChange={(value) => setFormData(prev => ({ ...prev, customerName: value }))}
                onRiskLevelChange={(riskLevel) => setFormData(prev => ({ ...prev, riskLevel }))}
              />
              
              <div>
                <Label htmlFor="orderNumber">Order Number *</Label>
                <Input
                  id="orderNumber"
                  value={formData.orderNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="product">Product *</Label>
                <Select value={formData.productId} onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, productId: value }));
                  const product = products?.find(p => p.id === value);
                  if (product) {
                    setFormData(prev => ({ ...prev, sellingPrice: product.selling_price }));
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {product.code} (Stock: {product.current_stock_quantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    max={selectedProduct?.current_stock_quantity || 0}
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                    required
                  />
                  {selectedProduct && (
                    <p className="text-sm text-gray-500 mt-1">
                      Available: {selectedProduct.current_stock_quantity} {selectedProduct.unit_of_measurement}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="sellingPrice">Price per Unit *</Label>
                  <Input
                    id="sellingPrice"
                    type="number"
                    step="0.01"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData(prev => ({ ...prev, sellingPrice: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="totalAmount">Total Amount</Label>
                <Input
                  id="totalAmount"
                  value={`₹${totalAmount.toFixed(2)}`}
                  readOnly
                  className="bg-gray-100"
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="bankAccount">Bank Account *</Label>
                <Select value={formData.bankAccountId} onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, bankAccountId: value }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.bank_name} - {account.account_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter sales description or notes..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                />
              </div>

              <FileUpload
                onFilesUploaded={(urls) => setFormData(prev => ({ ...prev, attachmentUrls: urls }))}
                existingFiles={formData.attachmentUrls}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSalesMutation.isPending}>
              {createSalesMutation.isPending ? "Creating..." : "Create Sales Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
