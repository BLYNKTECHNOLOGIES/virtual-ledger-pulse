
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { calculateFee } from "@/hooks/useWalletFees";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, getCurrentUserId } from "@/lib/system-action-logger";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface SalesEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SalesEntryDialog({ open, onOpenChange }: SalesEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for wallet balance and validation errors
  const [selectedWalletBalance, setSelectedWalletBalance] = useState<number | null>(null);
  const [selectedWalletFee, setSelectedWalletFee] = useState<number>(0);
  const [stockValidationError, setStockValidationError] = useState<string | null>(null);
  const [formTouched, setFormTouched] = useState(false); // Track if user has started filling form
  const [isOffMarket, setIsOffMarket] = useState(false);
  const [isGeneratingOrderNumber, setIsGeneratingOrderNumber] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [isNewClient, setIsNewClient] = useState(false);

  const [formData, setFormData] = useState({
    order_number: '', // User must enter this manually
    client_name: '',
    client_phone: '',
    client_state: '', // State field for client location
    product_id: '',
    wallet_id: '',
    platform: '',
    quantity: '',
    price_per_unit: '',
    total_amount: '',
    platform_fees: '',
    sales_payment_method_id: '',
    payment_status: 'COMPLETED',
    order_datetime: `${new Date().toISOString().slice(0, 16)}`,
    description: ''
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

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*, fee_percentage, is_fee_enabled')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch specific wallet balance when wallet is selected
  const { data: walletBalance } = useQuery({
    queryKey: ['wallet_balance', formData.wallet_id],
    queryFn: async () => {
      if (!formData.wallet_id) return null;
      
      const { data, error } = await supabase
        .from('wallets')
        .select('current_balance, wallet_name, wallet_type, fee_percentage, is_fee_enabled')
        .eq('id', formData.wallet_id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!formData.wallet_id,
  });

  // Update selected wallet balance and fee when wallet data changes
  useEffect(() => {
    setSelectedWalletBalance(walletBalance?.current_balance || null);
    if (walletBalance?.is_fee_enabled) {
      setSelectedWalletFee(walletBalance?.fee_percentage || 0);
    } else {
      setSelectedWalletFee(0);
    }
  }, [walletBalance]);

  // Validate stock quantity whenever quantity or platform fees changes
  useEffect(() => {
    if (formData.quantity && selectedWalletBalance !== null) {
      const quantity = parseFloat(formData.quantity);
      const platformFees = parseFloat(formData.platform_fees) || 0;
      const totalQuantityNeeded = quantity + platformFees;
      
      if (totalQuantityNeeded > selectedWalletBalance) {
        setStockValidationError(`Total required quantity (${totalQuantityNeeded.toFixed(2)}) exceeds available balance!`);
      } else {
        setStockValidationError(null);
      }
    } else {
      setStockValidationError(null);
    }
  }, [formData.quantity, formData.platform_fees, selectedWalletBalance]);


  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(
            account_name,
            bank_name
          )
        `)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const createSalesOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      // Get current user ID for tracking creator
      const createdBy = getCurrentUserId();
      
      const { data: result, error } = await supabase
        .from('sales_orders')
        .insert([{
          order_number: data.order_number,
          client_name: data.client_name,
          client_phone: data.client_phone || null,
          product_id: data.product_id || null,
          wallet_id: data.wallet_id || null,
          platform: data.platform || null,
          quantity: data.quantity,
          price_per_unit: data.price_per_unit,
          total_amount: data.total_amount,
          sales_payment_method_id: data.sales_payment_method_id || null,
          payment_status: data.payment_status,
          order_date: data.order_datetime ? `${data.order_datetime}:00.000Z` : new Date().toISOString(),
          description: data.description,
          is_off_market: data.is_off_market || false,
          created_by: createdBy
        }])
        .select()
        .single();
      
      if (error) throw error;

      // Set settlement status and handle bank crediting based on payment method type
      if (data.sales_payment_method_id && data.payment_status === 'COMPLETED') {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id, payment_gateway, current_usage, payment_limit')
          .eq('id', data.sales_payment_method_id)
          .single();

        // Update settlement status based on payment method type
        const settlementStatus = paymentMethod?.payment_gateway ? 'PENDING' : 'DIRECT';
        
        await supabase
          .from('sales_orders')
          .update({ settlement_status: settlementStatus })
          .eq('id', result.id);

        // Update payment method usage if it's a payment gateway
        if (paymentMethod?.payment_gateway) {
          const newUsage = (paymentMethod.current_usage || 0) + data.total_amount;
          await supabase
            .from('sales_payment_methods')
            .update({ current_usage: newUsage })
            .eq('id', data.sales_payment_method_id);
        }

        console.log('Sales order created - bank transaction will be handled by triggers if applicable');
      }

      // Process wallet deduction if wallet is selected and payment is completed
      if (data.wallet_id && data.payment_status === 'COMPLETED') {
        const quantity = parseFloat(data.quantity);
        const platformFees = parseFloat(data.platform_fees) || 0;
        const totalDeduction = quantity + platformFees;
        
        const { error: walletError } = await supabase.rpc('process_sales_order_wallet_deduction', {
          sales_order_id: result.id,
          wallet_id: data.wallet_id,
          usdt_amount: totalDeduction
        });

        if (walletError) {
          console.error('Error processing wallet deduction:', walletError);
          throw new Error(`Wallet deduction failed: ${walletError.message}`);
        }
      }

      // Check if client already exists in the clients table
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id, name')
        .or(`name.ilike.${data.client_name},phone.eq.${data.client_phone || ''}`)
        .limit(1)
        .maybeSingle();

      // If client doesn't exist, create an onboarding approval request
      if (!existingClient) {
        console.log('📝 New client detected, creating onboarding approval request...');
        const { error: approvalError } = await supabase
          .from('client_onboarding_approvals')
          .insert({
            sales_order_id: result.id,
            client_name: data.client_name,
            client_phone: data.client_phone || null,
            client_state: data.client_state || null,
            order_amount: data.total_amount,
            order_date: data.order_date,
            approval_status: 'PENDING'
          });

        if (approvalError) {
          console.error('⚠️ Failed to create approval request:', approvalError);
        } else {
          console.log('✅ Onboarding approval request created');
        }
      } else {
        console.log('✅ Existing client found:', existingClient.name);
      }

      return result;
    },
    onSuccess: (data) => {
      console.log('🎉 Sales order created successfully');
      
      // Log the action
      logActionWithCurrentUser({
        actionType: ActionTypes.SALES_MANUAL_ENTRY_CREATED,
        entityType: EntityTypes.SALES_ORDER,
        entityId: data.id,
        module: Modules.SALES,
        metadata: { order_number: data.order_number, client_name: formData.client_name, total_amount: formData.total_amount }
      });
      
      toast({ title: "Success", description: "Sales order created successfully. New clients will appear in approvals queue." });
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
      queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
      setFormData({
        order_number: '',
        client_name: '',
        client_phone: '',
        client_state: '',
        product_id: '',
        wallet_id: '',
        platform: '',
        quantity: '',
        price_per_unit: '',
        total_amount: '',
        platform_fees: '',
        sales_payment_method_id: '',
        payment_status: 'COMPLETED',
        order_datetime: `${new Date().toISOString().slice(0, 16)}`,
        description: ''
      });
      setFormTouched(false);
      setIsOffMarket(false);
      setSelectedClientId(undefined);
      setIsNewClient(false);
    },
    onError: (error: any) => {
      console.error('❌ Error creating sales order:', error);
      toast({ 
        title: "Error Creating Sales Order", 
        description: error?.message || "Failed to create sales order. Please check your inputs and try again.", 
        variant: "destructive" 
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 Starting sales order creation mutation with data:', formData);
    
    // Collect all validation errors
    const errors: string[] = [];
    
    if (!formData.order_number.trim()) {
      errors.push("Order number is required");
    }
    
    if (!formData.client_name.trim()) {
      errors.push("Customer name is required");
    }
    
    if (!formData.wallet_id) {
      errors.push("Wallet selection is required");
    }
    
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      errors.push("Valid quantity is required");
    }
    
    if (!formData.price_per_unit || parseFloat(formData.price_per_unit) <= 0) {
      errors.push("Valid price per unit is required");
    }
    
    if (stockValidationError) {
      errors.push(stockValidationError);
    }
    
    if (errors.length > 0) {
      console.log('❌ Validation failed:', errors);
      toast({ 
        title: "Validation Error", 
        description: errors.join(". "), 
        variant: "destructive" 
      });
      return;
    }
    
    console.log('✅ Validation passed, calling mutation');
    createSalesOrderMutation.mutate({
      ...formData,
      is_off_market: isOffMarket,
      platform_fees: isOffMarket ? '0' : formData.platform_fees
    });
  };

  const handleInputChange = (field: string, value: any) => {
    // Mark form as touched when user starts entering data
    if (!formTouched) {
      setFormTouched(true);
    }
    
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-populate platform when wallet is selected and fetch balance
      if (field === 'wallet_id' && value && wallets) {
        const selectedWallet = wallets.find(w => w.id === value);
        if (selectedWallet) {
          // Extract platform name from wallet name (e.g., "BINANCE SS" -> "BINANCE")
          const platformName = selectedWallet.wallet_name.split(' ')[0];
          updated.platform = platformName;
          
          // Reset quantity when wallet changes to avoid validation issues
          updated.quantity = '';
          updated.platform_fees = '';
          updated.total_amount = '';
        }
        
        // Clear wallet balance when wallet changes
        setSelectedWalletBalance(null);
        setStockValidationError(null);
      }
      
      // Auto-calculate bidirectionally
      if (field === 'quantity' || field === 'price_per_unit' || field === 'total_amount') {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(updated.quantity) || 0;
        const price = field === 'price_per_unit' ? parseFloat(value) || 0 : parseFloat(updated.price_per_unit) || 0;
        const total = field === 'total_amount' ? parseFloat(value) || 0 : parseFloat(String(updated.total_amount)) || 0;
        
        if (field === 'quantity' && price > 0) {
          // User changed quantity - calculate total
          updated.total_amount = (qty * price).toFixed(2);
        } else if (field === 'price_per_unit') {
          // User changed price - recalculate based on what exists
          if (qty > 0) {
            updated.total_amount = (qty * price).toFixed(2);
          } else if (total > 0 && price > 0) {
            updated.quantity = (total / price).toFixed(4);
          }
        } else if (field === 'total_amount') {
          // User changed total - calculate quantity if price exists
          if (price > 0) {
            updated.quantity = (total / price).toFixed(4);
          }
        }
      }
      
      return updated;
    });
  };

  // Calculate fee based on wallet fee percentage (if not off market)
  const quantity = parseFloat(formData.quantity) || 0;
  const feeInfo = isOffMarket ? { feeAmount: 0, netAmount: quantity } : calculateFee(quantity, selectedWalletFee);
  const calculatedFee = feeInfo.feeAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Sales Order</DialogTitle>
        </DialogHeader>

        <form 
          onSubmit={(e) => {
            console.log('🔥 FORM SUBMIT EVENT TRIGGERED!');
            handleSubmit(e);
          }} 
          className="space-y-4"
          noValidate
        >
          {/* First Row - Order Number and Customer Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Order Number *</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => handleInputChange('order_number', e.target.value)}
                placeholder={isGeneratingOrderNumber ? "Generating..." : isOffMarket ? "Auto-generated" : "Enter order number"}
                required
                disabled={isOffMarket || isGeneratingOrderNumber}
                className={isOffMarket ? "bg-muted" : ""}
              />
            </div>
            <div>
              <Label>Customer Phone</Label>
              <Input
                value={formData.client_phone}
                onChange={(e) => handleInputChange('client_phone', e.target.value)}
                placeholder="Enter phone"
              />
            </div>
          </div>

          {/* Second Row - Customer Name and State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <CustomerAutocomplete
                value={formData.client_name}
                onChange={(value) => handleInputChange('client_name', value)}
                onPhoneChange={(phone) => handleInputChange('client_phone', phone)}
                onClientSelect={(client) => {
                  if (client) {
                    setSelectedClientId(client.id);
                    // Auto-fill state from client if available
                    if (client.state) {
                      handleInputChange('client_state', client.state);
                    } else {
                      handleInputChange('client_state', '');
                    }
                  } else {
                    setSelectedClientId(undefined);
                    handleInputChange('client_state', '');
                  }
                }}
                onNewClient={(isNew) => setIsNewClient(isNew)}
                selectedClientId={selectedClientId}
              />
            </div>

            <div>
              <Label>State</Label>
              <Select
                value={formData.client_state}
                onValueChange={(value) => handleInputChange('client_state', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-[100] max-h-60">
                  {INDIAN_STATES_AND_UTS.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Third Row - Product and Wallet */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Product</Label>
              <Select
                value={formData.product_id}
                onValueChange={(value) => handleInputChange('product_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-[100]">
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - {product.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Wallet *</Label>
              <Select
                value={formData.wallet_id}
                onValueChange={(value) => handleInputChange('wallet_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-[100]">
                  {wallets?.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} ({wallet.wallet_type}) - Balance: {wallet.current_balance}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pricing row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Total Amount</Label>
              <Input
                type="number"
                value={formData.total_amount}
                onChange={(e) => handleInputChange('total_amount', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
                placeholder="Enter total amount"
              />
            </div>

            <div>
              <Label>Price Per Unit *</Label>
              <Input
                type="number"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', e.target.value)}
                required
                min="0"
                step="0.01"
                placeholder="Enter price per unit"
              />
            </div>

            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', e.target.value)}
                required
                min="0"
                step="0.01"
                placeholder="Enter quantity"
                className={stockValidationError ? "border-destructive" : ""}
              />
            </div>
          </div>

          {/* Wallet balance warning */}
          {stockValidationError && (
            <Alert className="border-destructive bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                {stockValidationError}
              </AlertDescription>
            </Alert>
          )}

          {/* Show wallet balance when wallet is selected */}
          {selectedWalletBalance !== null && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Available Balance in Selected Wallet: <strong>{selectedWalletBalance.toLocaleString()}</strong>
                {selectedWalletFee > 0 && !isOffMarket && (
                  <span className="ml-2 text-muted-foreground">
                    (Platform Fee: {selectedWalletFee}%)
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Off Market Toggle Section */}
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Off Market Order</Label>
                <p className="text-sm text-muted-foreground">
                  Enable to bypass platform fee deduction
                </p>
              </div>
              <Switch 
                checked={isOffMarket} 
                onCheckedChange={async (checked) => {
                  setIsOffMarket(checked);
                  if (checked) {
                    // Generate off-market order number
                    setIsGeneratingOrderNumber(true);
                    try {
                      const { data, error } = await supabase.rpc('generate_off_market_sales_order_number');
                      if (!error && data) {
                        handleInputChange('order_number', data);
                      }
                    } catch (err) {
                      console.error('Failed to generate off-market order number:', err);
                    } finally {
                      setIsGeneratingOrderNumber(false);
                    }
                  } else {
                    // Clear order number when turning off
                    handleInputChange('order_number', '');
                  }
                }}
              />
            </div>
            
            {!isOffMarket && selectedWalletFee > 0 && quantity > 0 && (
              <div className="space-y-2 bg-background p-3 rounded-md border">
                <div className="flex justify-between text-sm">
                  <span>Quantity Sold:</span>
                  <span className="font-medium">{quantity.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-sm text-orange-600">
                  <span>Platform Fee ({selectedWalletFee}%):</span>
                  <span className="font-medium">+{calculatedFee.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-2">
                  <span>Total Deducted from Wallet:</span>
                  <span className="text-primary">{(quantity + calculatedFee).toFixed(4)}</span>
                </div>
              </div>
            )}
            
            {isOffMarket && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                No platform fees will be applied
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Payment Method</Label>
              <Select
                value={formData.sales_payment_method_id}
                onValueChange={(value) => handleInputChange('sales_payment_method_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-200 shadow-lg z-50">
                  {paymentMethods?.map((method) => {
                    // Use nickname if available, otherwise fallback to payment details
                    const displayLabel = (method as any).nickname 
                      ? (method as any).nickname
                      : method.type === 'UPI' && method.upi_id 
                        ? `${method.upi_id} (${method.risk_category})` 
                        : method.bank_accounts 
                          ? `${method.bank_accounts.account_name} (${method.risk_category})` 
                          : `${method.type} (${method.risk_category})`;
                    
                    return (
                      <SelectItem key={method.id} value={method.id}>
                        {displayLabel} - ₹{method.current_usage?.toLocaleString()}/{method.payment_limit?.toLocaleString()}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Order Date & Time</Label>
              <Input
                type="datetime-local"
                value={formData.order_datetime}
                onChange={(e) => handleInputChange('order_datetime', e.target.value)}
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
              disabled={createSalesOrderMutation.isPending}
              onClick={() => console.log('🚀 Create Order button clicked!')}
            >
              {createSalesOrderMutation.isPending ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
