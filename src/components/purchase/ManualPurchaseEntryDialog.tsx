import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Wallet, Info, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SupplierAutocomplete } from "./SupplierAutocomplete";
import { createSellerClient } from "@/utils/clientIdGenerator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { recordActionTiming } from "@/lib/purchase-action-timing";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, getCurrentUserId } from "@/lib/system-action-logger";

interface ManualPurchaseEntryDialogProps {
  onSuccess?: () => void;
}

export const ManualPurchaseEntryDialog: React.FC<ManualPurchaseEntryDialogProps> = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [isGeneratingOrderNumber, setIsGeneratingOrderNumber] = useState(false);
  const [selectedClientBankDetails, setSelectedClientBankDetails] = useState<{
    pan_card_number?: string | null;
    linked_bank_accounts?: Array<{
      account_name?: string;
      account_number?: string;
      bank_name?: string;
      ifsc_code?: string;
    }> | null;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    order_number: '',
    supplier_name: '',
    order_date: new Date().toISOString().split('T')[0],
    description: '',
    product_id: '',
    quantity: '',
    price_per_unit: '',
    total_amount: '',
    contact_number: '',
    deduction_bank_account_id: '',
    credit_wallet_id: '',
    tds_option: 'none' as 'none' | '1%' | '20%',
    pan_number: '',
    fee_percentage: '',
    is_off_market: false
  });

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE');
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch products
  const { data: products, isLoading: productsLoading, error: productsError } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*');
      
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  // Fetch active wallets with detailed info
  const { data: wallets } = useQuery({
    queryKey: ['wallets-with-details'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, wallet_type, chain_name, current_balance, fee_percentage, is_fee_enabled, is_active')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (error) throw error;
      return data;
    }
  });

  // Selected product
  const selectedProduct = useMemo(() => 
    products?.find(p => p.id === formData.product_id),
    [products, formData.product_id]
  );

  // Selected wallet
  const selectedWallet = useMemo(() => 
    wallets?.find(w => w.id === formData.credit_wallet_id),
    [wallets, formData.credit_wallet_id]
  );

  // Calculate TDS amount
  const tdsCalculation = useMemo(() => {
    const totalAmount = parseFloat(formData.total_amount) || 0;
    let tdsRate = 0;
    
    if (formData.tds_option === '1%') tdsRate = 1;
    else if (formData.tds_option === '20%') tdsRate = 20;
    
    const tdsAmount = totalAmount * (tdsRate / 100);
    const netPayable = totalAmount - tdsAmount;
    
    return { tdsRate, tdsAmount, netPayable };
  }, [formData.total_amount, formData.tds_option]);

  // Calculate platform fee amount
  const feeCalculation = useMemo(() => {
    const quantity = parseFloat(formData.quantity) || 0;
    const feePercentage = parseFloat(formData.fee_percentage) || 0;
    
    if (formData.is_off_market || feePercentage <= 0) {
      return { feeAmount: 0, netCredit: quantity };
    }
    
    const feeAmount = quantity * (feePercentage / 100);
    const netCredit = quantity - feeAmount;
    
    return { feeAmount, netCredit };
  }, [formData.quantity, formData.fee_percentage, formData.is_off_market]);

  // Auto-fill PAN when TDS option changes to 1% and existing client with PAN is selected
  useEffect(() => {
    if (
      formData.tds_option === '1%' && 
      selectedClientId && 
      selectedClientBankDetails?.pan_card_number &&
      !formData.pan_number // Only auto-fill if PAN field is empty
    ) {
      setFormData(prev => ({
        ...prev,
        pan_number: selectedClientBankDetails.pan_card_number || ''
      }));
    }
  }, [formData.tds_option, selectedClientId, selectedClientBankDetails]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Bidirectional auto-calculation for amounts:
      // Priority: When editing a field, only recalculate the OTHER fields based on existing data.
      // Never overwrite the field the user is currently typing in.
      if (field === 'quantity' || field === 'price_per_unit' || field === 'total_amount') {
        const newValue = parseFloat(value as string) || 0;
        const existingQty = parseFloat(prev.quantity) || 0;
        const existingPrice = parseFloat(prev.price_per_unit) || 0;
        const existingTotal = parseFloat(prev.total_amount) || 0;

        if (field === 'quantity') {
          // User changed quantity: if price exists, calculate total
          if (existingPrice > 0 && newValue > 0) {
            updated.total_amount = (newValue * existingPrice).toFixed(2);
          }
        } else if (field === 'price_per_unit') {
          // User changed price: 
          // If total already exists, calculate quantity from total/price (preserve total, update qty)
          // Else if quantity exists, calculate total from qty*price
          if (existingTotal > 0 && newValue > 0) {
            updated.quantity = (existingTotal / newValue).toFixed(4);
          } else if (existingQty > 0 && newValue > 0) {
            updated.total_amount = (existingQty * newValue).toFixed(2);
          }
        } else if (field === 'total_amount') {
          // User changed total: if price exists, calculate quantity
          if (existingPrice > 0 && newValue > 0) {
            updated.quantity = (newValue / existingPrice).toFixed(4);
          }
        }
      }

      // Auto-populate wallet fee percentage when wallet is selected
      if (field === 'credit_wallet_id' && value) {
        const wallet = wallets?.find(w => w.id === value);
        if (wallet?.is_fee_enabled && wallet?.fee_percentage) {
          updated.fee_percentage = wallet.fee_percentage.toString();
        }
      }
      
      return updated;
    });
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now();
    return `MPE-${timestamp}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 ManualPurchase: Submit clicked');
    console.log('🚀 ManualPurchase: formData:', JSON.stringify(formData, null, 2));
    console.log('🚀 ManualPurchase: isNewClient:', isNewClient, 'selectedClientId:', selectedClientId);
    console.log('🚀 ManualPurchase: loading state:', loading);
    
    // Guard against double submission
    if (loading) {
      console.log('⚠️ ManualPurchase: Already loading, ignoring submit');
      return;
    }
    
    setLoading(true);

    try {
      // Validate required fields
      const missingFields = [];
      if (!formData.supplier_name) missingFields.push('supplier_name');
      if (!formData.quantity) missingFields.push('quantity');
      if (!formData.price_per_unit) missingFields.push('price_per_unit');
      if (!formData.product_id) missingFields.push('product_id');
      if (!formData.deduction_bank_account_id) missingFields.push('deduction_bank_account_id');
      if (!formData.credit_wallet_id) missingFields.push('credit_wallet_id');
      
      if (missingFields.length > 0) {
        console.log('❌ Validation failed - missing required fields:', missingFields);
        toast({
          title: "Error",
          description: `Missing required fields: ${missingFields.join(', ')}`,
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Validate PAN for 1% TDS
      if (formData.tds_option === '1%' && (!formData.pan_number || formData.pan_number.trim() === '')) {
        console.log('❌ Validation failed - PAN required for 1% TDS');
        toast({
          title: "Error",
          description: "PAN number is required for 1% TDS deduction",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // For off-market orders, generate the actual order number now (consuming the sequence)
      // For regular orders, use the form value or auto-generate
      let orderNumber: string;
      if (formData.is_off_market) {
        const { data: offMarketNumber, error: offMarketError } = await supabase.rpc('generate_off_market_purchase_order_number');
        if (offMarketError || !offMarketNumber) {
          throw new Error('Failed to generate off-market order number');
        }
        orderNumber = offMarketNumber;
      } else {
        orderNumber = formData.order_number || generateOrderNumber();
      }
      const totalAmount = parseFloat(formData.total_amount) || 0;
      console.log('📝 Order number:', orderNumber, 'Total amount:', totalAmount);

      // Get current user ID for created_by tracking
      const currentUserId = getCurrentUserId();

      // Prepare RPC parameters
      const rpcParams = {
        p_order_number: orderNumber,
        p_supplier_name: formData.supplier_name,
        p_order_date: formData.order_date,
        p_total_amount: totalAmount,
        p_product_id: formData.product_id,
        p_quantity: parseFloat(formData.quantity),
        p_unit_price: parseFloat(formData.price_per_unit),
        p_bank_account_id: formData.deduction_bank_account_id,
        p_description: formData.description || '',
        p_contact_number: formData.contact_number || undefined,
        p_credit_wallet_id: formData.credit_wallet_id || undefined,
        p_tds_option: formData.tds_option,
        p_pan_number: formData.pan_number || undefined,
        p_fee_percentage: formData.fee_percentage ? parseFloat(formData.fee_percentage) : undefined,
        p_is_off_market: formData.is_off_market,
        p_created_by: currentUserId || undefined
      };
      
      console.log('📡 Calling RPC create_manual_purchase_complete_v2 with params:', rpcParams);

      // Call the enhanced function with TDS and fee support
      const { data: result, error: functionError } = await supabase.rpc(
        'create_manual_purchase_complete_v2',
        rpcParams
      );

      console.log('📡 RPC response:', { result, functionError });

      if (functionError) {
        throw functionError;
      }

      // The RPC returns a JSON object even on failure; treat success:false as an error.
      if (result && typeof result === 'object' && 'success' in (result as Record<string, unknown>)) {
        const ok = Boolean((result as Record<string, unknown>).success);
        if (!ok) {
          const errMsg = String((result as Record<string, unknown>).error || 'Unknown error');
          throw new Error(errMsg);
        }
      }

      // Verify purchase order was created and is readable before proceeding
      if (!result || typeof result !== 'object' || !('purchase_order_id' in (result as Record<string, unknown>))) {
        throw new Error('Purchase order was not created properly - no order ID returned');
      }

      const orderId = (result as Record<string, unknown>).purchase_order_id as string;

      // Verify the purchase order is readable (RLS check)
      const { data: verifiedOrder, error: verifyError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('id', orderId)
        .single();

      if (verifyError || !verifiedOrder) {
        console.error('Purchase order verification failed:', verifyError);
        throw new Error('Purchase order created but not readable - check RLS policies');
      }

      console.log('✅ Purchase order verified:', orderId);

      // ONLY create seller client AFTER purchase order is successfully created and verified
      if (isNewClient && formData.supplier_name.trim()) {
        console.log('🆕 Creating new seller client after purchase order verification...');
        try {
          const newClient = await createSellerClient(
            formData.supplier_name.trim(),
            formData.contact_number || undefined
          );
          if (newClient) {
            console.log('✅ New seller client created');
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            queryClient.invalidateQueries({ queryKey: ['pending-seller-approvals'] });
          }
        } catch (clientError) {
          // Log but don't fail - purchase order was already created
          console.warn('Failed to create seller client, but purchase order succeeded:', clientError);
        }
      }

      // Record timing for manual entry - result contains the purchase order id
      await recordActionTiming(orderId, 'manual_entry_created', 'purchase_creator');
      await recordActionTiming(orderId, 'order_created', 'purchase_creator');
      
      // Log actions for audit trail
      await logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_MANUAL_ENTRY_CREATED,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: orderId,
        module: Modules.PURCHASE,
        metadata: { order_number: orderNumber }
      });
      await logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_ORDER_CREATED,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: orderId,
        module: Modules.PURCHASE,
        metadata: { order_number: orderNumber, is_manual_entry: true }
      });

      // Build success message with details
      let successMessage = `Purchase order ${orderNumber} created successfully!`;
      if (tdsCalculation.tdsRate > 0) {
        successMessage += ` TDS of ₹${tdsCalculation.tdsAmount.toFixed(2)} (${tdsCalculation.tdsRate}%) recorded.`;
      }
      if (feeCalculation.feeAmount > 0 && !formData.is_off_market) {
        successMessage += ` Platform fee of ${feeCalculation.feeAmount.toFixed(4)} USDT applied.`;
      }

      toast({
        title: "Success",
        description: successMessage
      });

      // Reset form
      setFormData({
        order_number: '',
        supplier_name: '',
        order_date: new Date().toISOString().split('T')[0],
        description: '',
        product_id: '',
        quantity: '',
        price_per_unit: '',
        total_amount: '',
        contact_number: '',
        deduction_bank_account_id: '',
        credit_wallet_id: '',
        tds_option: 'none',
        pan_number: '',
        fee_percentage: '',
        is_off_market: false
      });
      setSelectedClientId('');
      setIsNewClient(false);
      setSelectedClientBankDetails(null);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['tds-records'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });

      setOpen(false);
      onSuccess?.();

    } catch (error: any) {
      console.error('ManualPurchase: Error creating purchase order:', error);
      toast({
        title: "Error",
        description: `Failed to create purchase order: ${error.message || 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" />
          Manual Purchase Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Manual Purchase Entry
          </DialogTitle>
          <DialogDescription>
            Direct ledger entry — bypasses all workflow, timers, and notifications
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Order Number + Contact Number */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order_number">Order Number</Label>
              <Input
                id="order_number"
                value={formData.order_number}
                onChange={(e) => handleInputChange('order_number', e.target.value)}
                placeholder={isGeneratingOrderNumber ? "Generating..." : formData.is_off_market ? "Auto-generated" : "Auto-generated if empty"}
                disabled={formData.is_off_market || isGeneratingOrderNumber}
                className={formData.is_off_market ? "bg-muted" : ""}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact_number">Contact Number</Label>
              <Input
                id="contact_number"
                value={formData.contact_number}
                onChange={(e) => handleInputChange('contact_number', e.target.value)}
                placeholder="Enter contact number"
              />
            </div>
          </div>

          {/* Row 2: Seller Name + Product */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <SupplierAutocomplete
                value={formData.supplier_name}
                onChange={(value) => handleInputChange('supplier_name', value)}
                onContactChange={(contact) => handleInputChange('contact_number', contact)}
                onClientSelect={(clientId, clientName, bankDetails) => {
                  setSelectedClientId(clientId);
                  setSelectedClientBankDetails(bankDetails || null);
                  handleInputChange('supplier_name', clientName);
                  
                  // Auto-fill PAN if client has one and TDS is 1%
                  if (bankDetails?.pan_card_number && formData.tds_option === '1%') {
                    handleInputChange('pan_number', bankDetails.pan_card_number);
                  }
                }}
                onNewClient={(isNew) => {
                  setIsNewClient(isNew);
                  if (isNew) {
                    setSelectedClientBankDetails(null);
                  }
                }}
                selectedClientId={selectedClientId}
              />
            </div>
            
            {/* Product Selection */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product_id">Product *</Label>
              <Select 
                value={formData.product_id} 
                onValueChange={(value) => handleInputChange('product_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-[60] border border-border shadow-lg">
                  {productsLoading ? (
                    <SelectItem value="loading" disabled>Loading products...</SelectItem>
                  ) : productsError ? (
                    <SelectItem value="error" disabled>Error loading products</SelectItem>
                  ) : !products || products.length === 0 ? (
                    <SelectItem value="empty" disabled>No products found</SelectItem>
                  ) : (
                    products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {product.code} (Stock: {product.current_stock_quantity})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Total Amount, Price per Unit, Quantity */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total_amount">Total Amount (₹)</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                value={formData.total_amount}
                onChange={(e) => handleInputChange('total_amount', e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price_per_unit">Price per Unit (₹) *</Label>
              <Input
                id="price_per_unit"
                type="number"
                step="0.01"
                value={formData.price_per_unit}
                onChange={(e) => handleInputChange('price_per_unit', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.0001"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Row 4: Wallet and Bank Account on same line */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="credit_wallet_id">Wallet *</Label>
              <Select 
                value={formData.credit_wallet_id} 
                onValueChange={(value) => {
                  console.log('🪙 ManualPurchase: wallet selected:', value);
                  handleInputChange('credit_wallet_id', value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 border border-border shadow-lg">
                  {wallets?.filter(w => w.wallet_type === 'USDT').map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name}
                      {wallet.chain_name ? ` — ${wallet.chain_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deduction_bank_account_id">Bank Account *</Label>
              <Select 
                value={formData.deduction_bank_account_id} 
                onValueChange={(value) => handleInputChange('deduction_bank_account_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 border border-border shadow-lg">
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - ₹{Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TDS Section */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Label className="font-medium">TDS Deduction</Label>
                <Badge variant="outline" className="text-xs">Tax</Badge>
              </div>
              
              <Select 
                value={formData.tds_option} 
                onValueChange={(value) => handleInputChange('tds_option', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select TDS option" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  <SelectItem value="none">No TDS</SelectItem>
                  <SelectItem value="1%">1% TDS (Requires PAN)</SelectItem>
                  <SelectItem value="20%">20% TDS (No PAN Required)</SelectItem>
                </SelectContent>
              </Select>

              {formData.tds_option === '1%' && (
                <div className="space-y-2">
                  <Label htmlFor="pan_number">PAN Number *</Label>
                  <Input
                    id="pan_number"
                    value={formData.pan_number}
                    onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className="uppercase"
                  />
                </div>
              )}

              {tdsCalculation.tdsRate > 0 && parseFloat(formData.total_amount) > 0 && (
                <div className="text-sm bg-white p-2 rounded border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TDS Amount ({tdsCalculation.tdsRate}%):</span>
                    <span className="font-medium text-amber-600">₹{tdsCalculation.tdsAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">Net Payable:</span>
                    <span className="font-semibold text-green-600">₹{tdsCalculation.netPayable.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Platform Fee Section */}
          <Card className="border-muted">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Off Market</Label>
                  <Info className="w-3 h-3 text-muted-foreground" />
                </div>
                <Switch
                  checked={formData.is_off_market}
                  onCheckedChange={async (checked) => {
                    handleInputChange('is_off_market', checked);
                    if (checked) {
                      // Preview off-market order number (without consuming sequence)
                      setIsGeneratingOrderNumber(true);
                      try {
                        const { data, error } = await supabase.rpc('preview_off_market_purchase_order_number');
                        if (!error && data) {
                          handleInputChange('order_number', data);
                        }
                      } catch (err) {
                        console.error('Failed to preview off-market order number:', err);
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
              
              {!formData.is_off_market && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fee_percentage">Platform Fee (%)</Label>
                    <Input
                      id="fee_percentage"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.fee_percentage}
                      onChange={(e) => handleInputChange('fee_percentage', e.target.value)}
                      placeholder="Enter fee percentage"
                    />
                  </div>

                  {feeCalculation.feeAmount > 0 && parseFloat(formData.quantity) > 0 && (
                    <div className="text-sm bg-muted/50 p-2 rounded border">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee Amount:</span>
                        <span className="font-medium text-orange-600">{feeCalculation.feeAmount.toFixed(4)} USDT</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">Net Credit to Wallet:</span>
                        <span className="font-semibold text-green-600">{feeCalculation.netCredit.toFixed(4)} USDT</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {formData.is_off_market && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Off Market: No platform fees will be applied
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Date */}
          <div className="space-y-2">
            <Label htmlFor="order_date">Order Date</Label>
            <Input
              id="order_date"
              type="date"
              value={formData.order_date}
              onChange={(e) => handleInputChange('order_date', e.target.value)}
            />
          </div>

          {/* Description - moved to bottom */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter purchase description"
              rows={2}
            />
          </div>

          {/* Summary Card */}
          {parseFloat(formData.total_amount) > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="text-sm font-medium mb-2">Transaction Summary</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order Amount:</span>
                    <span>₹{parseFloat(formData.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {tdsCalculation.tdsRate > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>TDS Deducted ({tdsCalculation.tdsRate}%):</span>
                      <span>-₹{tdsCalculation.tdsAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Bank Deduction:</span>
                    <span className="text-destructive">-₹{tdsCalculation.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {selectedProduct?.code === 'USDT' && (
                    <>
                      <div className="flex justify-between pt-2 border-t mt-2">
                        <span className="text-muted-foreground">Quantity Purchased:</span>
                        <span>{parseFloat(formData.quantity || '0').toFixed(4)} USDT</span>
                      </div>
                      {!formData.is_off_market && feeCalculation.feeAmount > 0 && (
                        <div className="flex justify-between text-orange-600">
                          <span>Platform Fee:</span>
                          <span>-{feeCalculation.feeAmount.toFixed(4)} USDT</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-green-600">
                        <span>Wallet Credit:</span>
                        <span>+{feeCalculation.netCredit.toFixed(4)} USDT</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="min-w-[160px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Manual Entry"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
