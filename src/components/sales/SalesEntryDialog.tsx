
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
import { FileUpload } from "./FileUpload";

interface SalesEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preFilledData?: any;
}

interface SalesEntryForm {
  customerName: string;
  orderNumber: string;
  productId: string;
  quantity: number;
  price: number;
  warehouseId: string;
  orderDate: string;
  description: string;
  attachmentUrls: string[];
  platform: string;
  paymentReceivedInBank: string;
  salesAmount: number;
}

export function SalesEntryDialog({ open, onOpenChange, preFilledData }: SalesEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<SalesEntryForm>({
    customerName: "",
    orderNumber: "",
    productId: "",
    quantity: 0,
    price: 0,
    warehouseId: "",
    orderDate: new Date().toISOString().split('T')[0],
    description: "",
    attachmentUrls: [],
    platform: "",
    paymentReceivedInBank: "",
    salesAmount: 0
  });

  // Pre-fill form data when dialog opens
  useEffect(() => {
    if (preFilledData && open) {
      setFormData(prev => ({
        ...prev,
        platform: preFilledData.platform || "",
        paymentReceivedInBank: preFilledData.paymentMethod?.bank_accounts?.bank_name || "",
        salesAmount: preFilledData.amount || 0,
      }));
    }
  }, [preFilledData, open]);

  // Fetch products with stock quantities
  const { data: products } = useQuery({
    queryKey: ['products_with_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .gt('current_stock_quantity', 0)
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

  const selectedProduct = products?.find(p => p.id === formData.productId);
  const totalAmount = formData.quantity * formData.price;

  const createSalesMutation = useMutation({
    mutationFn: async (salesData: SalesEntryForm) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create sales order
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
          platform: salesData.platform,
          created_by: user?.id
        })
        .select()
        .single();

      if (salesError) throw salesError;

      // Create stock out transaction
      const { error: stockError } = await supabase
        .from('stock_transactions')
        .insert({
          product_id: salesData.productId,
          transaction_type: 'OUT',
          quantity: salesData.quantity,
          unit_price: salesData.price,
          total_amount: totalAmount,
          reference_number: salesData.orderNumber,
          supplier_customer_name: salesData.customerName,
          transaction_date: salesData.orderDate,
          reason: 'Sales'
        });

      if (stockError) throw stockError;

      // Update product stock quantity
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
        description: "Sales order has been successfully created.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
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
      price: 0,
      warehouseId: "",
      orderDate: new Date().toISOString().split('T')[0],
      description: "",
      attachmentUrls: [],
      platform: "",
      paymentReceivedInBank: "",
      salesAmount: 0
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
          <DialogTitle>Sales Entry Form</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  required
                />
              </div>
              
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
                <Label htmlFor="platform">Platform *</Label>
                <Input
                  id="platform"
                  value={formData.platform}
                  onChange={(e) => setFormData(prev => ({ ...prev, platform: e.target.value }))}
                  required
                  readOnly={!!preFilledData?.platform}
                  className={preFilledData?.platform ? "bg-gray-100" : ""}
                />
              </div>

              <div>
                <Label htmlFor="paymentReceivedInBank">Payment Received in Bank *</Label>
                <Input
                  id="paymentReceivedInBank"
                  value={formData.paymentReceivedInBank}
                  onChange={(e) => setFormData(prev => ({ ...prev, paymentReceivedInBank: e.target.value }))}
                  required
                  readOnly={!!preFilledData?.paymentMethod}
                  className={preFilledData?.paymentMethod ? "bg-gray-100" : ""}
                />
              </div>

              <div>
                <Label htmlFor="stockName">Stock Name *</Label>
                <Select value={formData.productId} onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, productId: value }));
                  const product = products?.find(p => p.id === value);
                  if (product) {
                    setFormData(prev => ({ ...prev, price: product.selling_price }));
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stock/product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {product.code} (Available: {product.current_stock_quantity} {product.unit_of_measurement})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="warehouse">Select Warehouse *</Label>
                <Select value={formData.warehouseId} onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, warehouseId: value }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} - {warehouse.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="salesAmount">Amount of Sales *</Label>
                <Input
                  id="salesAmount"
                  type="number"
                  step="0.01"
                  value={formData.salesAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, salesAmount: parseFloat(e.target.value) || 0 }))}
                  required
                  readOnly={!!preFilledData?.amount}
                  className={preFilledData?.amount ? "bg-gray-100" : ""}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price (Can be decimal) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="quantity">Quantity (Can be decimal) *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedProduct?.current_stock_quantity || 0}
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                  {selectedProduct && (
                    <p className="text-sm text-gray-500 mt-1">
                      Available: {selectedProduct.current_stock_quantity} {selectedProduct.unit_of_measurement}
                    </p>
                  )}
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
                <Label htmlFor="description">Order Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Enter order description or notes..."
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
