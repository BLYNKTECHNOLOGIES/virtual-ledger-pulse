import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUpload } from "./FileUpload";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { WalletSelector } from "@/components/stock/WalletSelector";
import { StockStatusBadge } from "@/components/stock/StockStatusBadge";
import { useUSDTRate, calculatePlatformFeeInUSDT } from "@/hooks/useUSDTRate";
import { useAverageCost } from "@/hooks/useAverageCost";
import { AlertTriangle, Info, TrendingUp } from "lucide-react";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

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
    product_id: "",
    wallet_id: "",
    amount: 0,
    quantity: "",
    price_per_unit: "",
    platform_fees: "",
    order_date: new Date().toISOString().split('T')[0],
    order_time: new Date().toTimeString().slice(0, 5), // HH:MM format
    delivery_date: "",
    payment_status: "PENDING",
    sales_payment_method_id: "",
    description: "",
    cosmos_alert: false,
    credits_applied: 0,
  });
  
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [isOffMarket, setIsOffMarket] = useState(false);

  // Fetch live USDT/INR rate
  const { data: usdtRateData } = useUSDTRate();
  
  // Fetch average cost for USDT
  const { data: averageCosts } = useAverageCost();

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
           bank_accounts:bank_account_id(account_name, bank_name, balance),
           payment_gateway
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

  // Fetch wallets with fee info
  const { data: wallets } = useQuery({
    queryKey: ['wallets_with_fees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, wallet_type, fee_percentage, is_fee_enabled, current_balance')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Calculate platform fee in USDT based on selected wallet and order amount
  const calculatedFee = useMemo(() => {
    if (isOffMarket || !formData.wallet_id || !formData.amount || formData.amount <= 0) {
      return { feeINR: 0, feeUSDT: 0, feePercentage: 0 };
    }

    const selectedWallet = wallets?.find(w => w.id === formData.wallet_id);
    if (!selectedWallet?.is_fee_enabled || !selectedWallet.fee_percentage) {
      return { feeINR: 0, feeUSDT: 0, feePercentage: 0 };
    }

    const usdtRate = usdtRateData?.rate || 84.5;
    const { feeINR, feeUSDT } = calculatePlatformFeeInUSDT(
      formData.amount,
      selectedWallet.fee_percentage,
      usdtRate
    );

    return {
      feeINR,
      feeUSDT,
      feePercentage: selectedWallet.fee_percentage
    };
  }, [formData.wallet_id, formData.amount, wallets, usdtRateData, isOffMarket]);

  // Get average buying price for USDT
  const averageBuyingPrice = useMemo(() => {
    const usdtCost = averageCosts?.find(c => c.product_code === 'USDT');
    return usdtCost?.average_cost || 0;
  }, [averageCosts]);

  const createSalesOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const netQuantity = parseFloat(orderData.quantity) || 0;
      const feeUSDT = orderData.feeUSDT || 0; // Fee in USDT to deduct from wallet
      
      // Validate stock before creating sales order
      if (orderData.product_id && orderData.quantity) {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('name, current_stock_quantity')
          .eq('id', orderData.product_id)
          .single();

        if (productError) throw productError;

        if (!product) {
          throw new Error('Product not found');
        }
        
        // Only check for net quantity - fees are separate
        if (product.current_stock_quantity < netQuantity) {
          throw new Error(
            `Insufficient stock. Available: ${product.current_stock_quantity}, Required: ${netQuantity} for product: ${product.name}`
          );
        }
      }

      // Validate wallet balance for USDT transactions (quantity + fee)
      if (orderData.wallet_id && orderData.quantity) {
        const { data: wallet, error: walletError } = await supabase
          .from('wallets')
          .select('current_balance, wallet_name')
          .eq('id', orderData.wallet_id)
          .single();

        if (walletError) throw walletError;

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        // Total required = net quantity + fee in USDT
        const totalRequired = netQuantity + feeUSDT;
        
        if (wallet.current_balance < totalRequired) {
          throw new Error(
            `Insufficient wallet balance. Available: ${wallet.current_balance.toFixed(6)} USDT, Required: ${totalRequired.toFixed(6)} USDT (${netQuantity.toFixed(6)} quantity + ${feeUSDT.toFixed(6)} fee) in wallet: ${wallet.wallet_name}`
          );
        }
      }
      
      // Combine date and time into a single datetime string
      const orderDateTime = orderData.order_time 
        ? `${orderData.order_date}T${orderData.order_time}:00.000Z`
        : `${orderData.order_date}T00:00:00.000Z`;
      
      // Create sales order - platform_fees now stores the USDT fee amount
      const { data, error } = await supabase
        .from('sales_orders')
        .insert([{
          ...orderData,
          order_date: orderDateTime,
          quantity: netQuantity,
          price_per_unit: parseFloat(orderData.price_per_unit) || 0,
          platform_fees: feeUSDT, // Store USDT fee amount
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      // Handle USDT wallet transactions for sales
      if (orderData.wallet_id && netQuantity > 0) {
        // Debit net quantity from wallet for the sale
        await supabase
          .from('wallet_transactions')
          .insert({
            wallet_id: orderData.wallet_id,
            transaction_type: 'DEBIT',
            amount: netQuantity,
            reference_type: 'SALES_ORDER',
            reference_id: data.id,
            description: `USDT sold via sales order ${data.order_number}`,
            balance_before: 0,
            balance_after: 0
          });

        // Debit fee from wallet separately (if applicable)
        if (feeUSDT > 0) {
          await supabase
            .from('wallet_transactions')
            .insert({
              wallet_id: orderData.wallet_id,
              transaction_type: 'DEBIT',
              amount: feeUSDT,
              reference_type: 'PLATFORM_FEE',
              reference_id: data.id,
              description: `Platform fee for sales order ${data.order_number} (${orderData.feePercentage}% of ₹${orderData.amount})`,
              balance_before: 0,
              balance_after: 0
            });

          // Record fee deduction with all relevant data
          await supabase
            .from('wallet_fee_deductions')
            .insert({
              wallet_id: orderData.wallet_id,
              order_id: data.id,
              order_type: 'SALES',
              order_number: data.order_number,
              gross_amount: orderData.amount,
              fee_percentage: orderData.feePercentage,
              fee_amount: orderData.feeINR, // Fee in INR (for reference)
              net_amount: orderData.amount, // Net amount unchanged
              fee_usdt_amount: feeUSDT, // Actual USDT deducted
              usdt_rate_used: orderData.usdtRate || 0,
              average_buying_price: orderData.averageBuyingPrice || 0,
              fee_inr_value_at_buying_price: feeUSDT * (orderData.averageBuyingPrice || 0)
            });
        }
      }

      // Update payment method usage if provided
      if (orderData.sales_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('current_usage')
          .eq('id', orderData.sales_payment_method_id)
          .single();
          
        if (paymentMethod) {
          await supabase
            .from('sales_payment_methods')
            .update({ 
              current_usage: paymentMethod.current_usage + orderData.amount 
            })
            .eq('id', orderData.sales_payment_method_id);
        }
      }

      return data;
    },
    onSuccess: (data) => {
      // Log the action
      logActionWithCurrentUser({
        actionType: ActionTypes.SALES_ORDER_CREATED,
        entityType: EntityTypes.SALES_ORDER,
        entityId: data.id,
        module: Modules.SALES,
        metadata: { order_number: data.order_number, client_name: formData.client_name, amount: formData.amount }
      });
      
      toast({
        title: "Sales Order Created",
        description: "Sales order has been successfully created.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
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
      product_id: "",
      wallet_id: "",
      amount: 0,
      quantity: "",
      price_per_unit: "",
      platform_fees: "",
      order_date: new Date().toISOString().split('T')[0],
      order_time: new Date().toTimeString().slice(0, 5),
      delivery_date: "",
      payment_status: "PENDING",
      sales_payment_method_id: "",
      description: "",
      cosmos_alert: false,
      credits_applied: 0,
    });
    setAttachmentUrls([]);
    setShowPaymentMethodAlert(false);
    setIsOffMarket(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.order_number.trim()) {
      toast({
        title: "Error",
        description: "Please enter an order number",
        variant: "destructive",
      });
      return;
    }

    if (!formData.wallet_id) {
      toast({
        title: "Error",
        description: "Please select a wallet - it is required for all sales orders",
        variant: "destructive",
      });
      return;
    }

    // Check if no payment methods are available
    if (!salesPaymentMethods || salesPaymentMethods.length === 0) {
      setShowPaymentMethodAlert(true);
      return;
    }

    // Pass calculated fee data to mutation
    const orderDataWithFees = {
      ...formData,
      feeUSDT: calculatedFee.feeUSDT,
      feeINR: calculatedFee.feeINR,
      feePercentage: calculatedFee.feePercentage,
      usdtRate: usdtRateData?.rate || 0,
      averageBuyingPrice: averageBuyingPrice,
      isOffMarket: isOffMarket,
    };

    createSalesOrderMutation.mutate(orderDataWithFees);
  };

  const getAvailableLimit = (methodId: string) => {
    const method = salesPaymentMethods?.find(m => m.id === methodId);
    if (!method) return 0;
    return method.payment_limit - method.current_usage;
  };

  const getUsagePercentage = (methodId: string) => {
    const method = salesPaymentMethods?.find(m => m.id === methodId);
    if (!method || method.payment_limit === 0) return 0;
    return Math.min((method.current_usage / method.payment_limit) * 100, 100);
  };

  // Calculate price per unit when amount or quantity changes
  const handleAmountChange = (amount: number) => {
    setFormData(prev => ({
      ...prev,
      amount,
      price_per_unit: prev.quantity && parseFloat(prev.quantity) > 0 ? (amount / parseFloat(prev.quantity)).toString() : ""
    }));
  };

  const handleQuantityChange = (quantity: string) => {
    setFormData(prev => ({
      ...prev,
      quantity,
      price_per_unit: quantity && parseFloat(quantity) > 0 ? (prev.amount / parseFloat(quantity)).toString() : ""
    }));
  };

  const handlePricePerUnitChange = (pricePerUnit: string) => {
    setFormData(prev => ({
      ...prev,
      price_per_unit: pricePerUnit,
      amount: pricePerUnit && prev.quantity && parseFloat(pricePerUnit) > 0 && parseFloat(prev.quantity) > 0 
        ? parseFloat(pricePerUnit) * parseFloat(prev.quantity) 
        : prev.amount
    }));
  };

  const handlePaymentMethodAlertOk = () => {
    setShowPaymentMethodAlert(false);
    onOpenChange(false);
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
          <form onSubmit={handleSubmit} className="space-y-6">
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

                <div>
                  <Label>Wallet *</Label>
                  <WalletSelector
                    value={formData.wallet_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, wallet_id: value }))}
                    showBalanceInfo={true}
                  />
                </div>

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

                {/* Off Market Toggle and Fee Display */}
                <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="off_market"
                        checked={isOffMarket}
                        onCheckedChange={(checked) => setIsOffMarket(!!checked)}
                      />
                      <Label htmlFor="off_market" className="font-medium">Off Market (No Platform Fee)</Label>
                    </div>
                    {usdtRateData && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        USDT/INR: ₹{usdtRateData.rate.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                  
                  {!isOffMarket && calculatedFee.feePercentage > 0 && formData.amount > 0 && (
                    <div className="text-sm space-y-1 pl-6">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee Rate:</span>
                        <span>{calculatedFee.feePercentage}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee (INR):</span>
                        <span>₹{calculatedFee.feeINR.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium text-amber-600">
                        <span>Fee to Deduct (USDT):</span>
                        <span>{calculatedFee.feeUSDT.toFixed(6)} USDT</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="quantity">Quantity (USDT) *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.000001"
                    placeholder="Enter quantity"
                    value={formData.quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    required
                  />
                  {!isOffMarket && calculatedFee.feeUSDT > 0 && formData.quantity && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Total wallet deduction: {(parseFloat(formData.quantity) + calculatedFee.feeUSDT).toFixed(6)} USDT
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="price_per_unit">Price per Unit</Label>
                  <Input
                    id="price_per_unit"
                    type="number"
                    step="0.01"
                    placeholder="Enter price per unit"
                    value={formData.price_per_unit}
                    onChange={(e) => handlePricePerUnitChange(e.target.value)}
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
                    <Label htmlFor="order_time">Order Time *</Label>
                    <Input
                      id="order_time"
                      type="time"
                      value={formData.order_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, order_time: e.target.value }))}
                      required
                    />
                  </div>
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


                <div>
                  <Label htmlFor="sales_payment_method_id">Payment Method</Label>
                  {salesPaymentMethods && salesPaymentMethods.length > 0 ? (
                    <Select onValueChange={(value) => setFormData(prev => ({ ...prev, sales_payment_method_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        {salesPaymentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            <div className="flex flex-col">
                              <span>
                                {method.type === 'UPI' ? method.upi_id : method.bank_accounts?.account_name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {method.risk_category}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        All possible payment methods are shown above. No available methods left. Contact your admin.
                      </AlertDescription>
                    </Alert>
                  )}
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

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSalesOrderMutation.isPending}>
                {createSalesOrderMutation.isPending ? "Creating..." : "Create Sales Order"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
