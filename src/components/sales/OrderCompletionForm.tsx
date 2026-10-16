import { useState, useEffect } from "react";
import type { ComponentProps } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Loader2, Wallet } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { fetchActiveWalletsWithLedgerUsdtBalance, fetchWalletLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
import {
  DialogBody,
  DialogFoot,
  DialogHead,
  Facts,
  Field,
  FieldGrid,
  OrderNo,
  SalesStatusChip,
  Section,
  SummaryRow,
  dialogContentClass,
  fmtAssetQty,
  fmtInr,
  fmtQty,
  fmtRate,
} from "@/components/orders-ui";

interface OrderCompletionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function OrderCompletionForm({ open, onOpenChange, order }: OrderCompletionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    stockName: '',
    quantity: 1,
    price: 0,
    warehouseId: '',
    description: '',
    platform: ''
  });

  // Sync form data when dialog opens with a new order
  useEffect(() => {
    if (open && order) {
      setFormData({
        stockName: '',
        quantity: 1,
        price: order.price_per_unit || order.total_amount || 0,
        warehouseId: '',
        description: `Sales order completion for ${order.client_name || ''}`,
        platform: order.platform || ''
      });
    }
  }, [open, order?.id]);

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      // Stock syncing is handled by database triggers automatically
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  // Fetch wallets with ledger-backed USDT balances
  const { data: wallets } = useQuery({
    queryKey: ['wallets_with_ledger_usdt_for_order_completion'],
    queryFn: async () => {
      return fetchActiveWalletsWithLedgerUsdtBalance('id, wallet_name, wallet_address, is_active, current_balance');
    },
  });

  // Remove warehouse functionality - using wallets only

  // Complete order mutation with wallet deduction
  const completeOrderMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get selected product and wallet
      const selectedProduct = products?.find(p => p.name === formData.stockName);
      const walletId = order?.wallet_id;
      const usdtAmount = order?.usdt_amount || order?.total_amount;

      // Validate stock before completing order
      if (selectedProduct && formData.quantity) {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('name, current_stock_quantity')
          .eq('id', selectedProduct.id)
          .single();

        if (productError) throw productError;

        if (!product) {
          throw new Error('Product not found');
        }

        if (product.current_stock_quantity < formData.quantity) {
          throw new Error(
            `Insufficient stock. Available: ${product.current_stock_quantity}, Required: ${formData.quantity} for product: ${product.name}`
          );
        }
      }

      // Validate wallet balance for USDT transactions
      if (walletId && usdtAmount > 0) {
        const walletName = wallets?.find((w) => w.id === walletId)?.wallet_name || 'Selected wallet';
        const walletBalance = await fetchWalletLedgerUsdtBalance(walletId);

        if (walletBalance < usdtAmount) {
          throw new Error(
            `Insufficient wallet balance. Available: ${walletBalance}, Required: ${usdtAmount} in wallet: ${walletName}`
          );
        }
      }

      // Update the sales order with completion details
      const { error: updateError } = await supabase
        .from('sales_orders')
        .update({
          product_id: selectedProduct?.id,
          warehouse_id: formData.warehouseId,
          quantity: formData.quantity,
          price_per_unit: formData.price,
          total_amount: formData.quantity * formData.price,
          description: formData.description,
          payment_status: 'COMPLETED',
          status: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // Process wallet deduction if wallet and amount are specified
      if (walletId && usdtAmount > 0) {
        // Determine asset code from the selected product
        const assetCode = selectedProduct?.code || 'USDT';
        
        // Deduct only the quantity sold (not including fees)
        const { error: walletDeductError } = await supabase.rpc(
          'process_sales_order_wallet_deduction',
          {
            sales_order_id: order.id,
            wallet_id: walletId,
            usdt_amount: usdtAmount,
            p_asset_code: assetCode
          }
        );

        if (walletDeductError) {
          throw new Error(`Wallet deduction failed: ${walletDeductError.message}`);
        }
        
        // Process platform fee separately if applicable
        const platformFees = order?.fee_amount || 0;
        if (platformFees > 0) {
          const { data: feeResult, error: feeError } = await supabase.rpc('process_platform_fee_deduction', {
            p_order_id: order.id,
            p_order_type: 'SALES_ORDER',
            p_wallet_id: walletId,
            p_fee_amount: platformFees,
            p_order_number: order.order_number
          });
          
          if (feeError) {
            console.error('Error processing platform fee:', feeError);
            // Don't throw - main order was completed, just log
          }
        }
      }

      // Process bank transaction if payment method exists
      if (order.sales_payment_method_id) {
        const { data: paymentMethod } = await supabase
          .from('sales_payment_methods')
          .select('bank_account_id')
          .eq('id', order.sales_payment_method_id)
          .single();

        // Note: Bank transaction will be automatically created by database triggers
        // Bank transaction will be handled by triggers
      }

      return order.id;
    },
     onSuccess: async () => {
      toast({ 
        title: "Order Completed", 
        description: "Sales order completed successfully with wallet deduction and stock updates" 
      });
       
       // Check if client exists - if not, create an onboarding approval request for new buyers
       try {
         const clientName = order?.client_name;
         const clientPhone = order?.client_phone;
         
         if (clientName) {
           const { data: existingClient } = await supabase
             .from('clients')
             .select('id, name')
             .ilike('name', clientName.trim())
             .eq('is_deleted', false)
             .limit(1)
             .maybeSingle();
           
           // If client doesn't exist, create an onboarding approval request
            if (!existingClient) {
              const { error: approvalError } = await supabase
               .from('client_onboarding_approvals')
               .insert({
                 sales_order_id: order.id,
                 client_name: clientName,
                 client_phone: clientPhone || null,
                 order_amount: order.total_amount || 0,
                 order_date: new Date().toISOString().split('T')[0],
                 approval_status: 'PENDING'
               });
 
             if (approvalError) {
                console.error('Failed to create approval request:', approvalError);
              }
           } else {
             
           }
         }
       } catch (approvalCheckError) {
         console.error('Error checking for existing client:', approvalCheckError);
       }
       
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
       queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error completing order:', error);
      toast({ 
        title: "Error", 
        description: `Failed to complete order: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const selectedWallet = wallets?.find(w => w.id === order?.wallet_id);
  const totalAmount = formData.quantity * formData.price;

  /* ── Presentation (display only) ──────────────────────────────────────── */

  const selectedProductView = products?.find((p) => p.name === formData.stockName);
  const orderAmountView = Number(order?.total_amount) || 0;
  const amountGap = totalAmount - orderAmountView;
  const walletAddress = selectedWallet
    ? (typeof selectedWallet.wallet_address === 'string' && selectedWallet.wallet_address.length > 16
        ? `${selectedWallet.wallet_address.substring(0, 10)}...${selectedWallet.wallet_address.substring(selectedWallet.wallet_address.length - 6)}`
        : '—')
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("lg")}>
        <DialogHead
          icon={CheckCircle}
          title="Complete sales order"
          description="Record what was sold for this order. Completing marks it paid and completed."
          meta={
            order ? (
              <>
                <OrderNo value={order.order_number} />
                <SalesStatusChip status={order.payment_status} />
              </>
            ) : null
          }
        />

        <DialogBody>
          <Group title="Order">
            <Facts
              cols={3}
              items={[
                { label: 'Client', value: order?.client_name || '—' },
                { label: 'Order amount', value: fmtInr(order?.total_amount), className: 'tabular-nums' },
                { label: 'USDT amount', value: fmtAssetQty(order?.usdt_amount || order?.total_amount, 'USDT'), className: 'tabular-nums' },
              ]}
            />
          </Group>

          {selectedWallet && (
            <Group title="Wallet" icon={Wallet}>
              <Facts
                cols={3}
                items={[
                  { label: 'Name', value: selectedWallet.wallet_name },
                  { label: 'Balance', value: fmtAssetQty(selectedWallet.current_balance, 'USDT'), className: 'tabular-nums' },
                  { label: 'Address', value: walletAddress, mono: walletAddress !== '—' },
                ]}
              />
            </Group>
          )}

          <Group title="Completion details">
            <FieldGrid>
              <Field
                label="Stock / product"
                htmlFor="completion-product"
                required
                hint={!formData.stockName ? 'Select a product to complete the order.' : undefined}
                className="sm:col-span-2"
              >
                <Select value={formData.stockName} onValueChange={(value) => setFormData({...formData, stockName: value})}>
                  <SelectTrigger id="completion-product">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.name}>
                        {product.name}
                        <span className="text-muted-foreground"> · Stock: {fmtQty(product.current_stock_quantity)} {product.unit_of_measurement}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Quantity" htmlFor="completion-quantity">
                <Input
                  id="completion-quantity"
                  type="number"
                  inputMode="decimal"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 1})}
                  min="0.01"
                  step="0.01"
                  className="tabular-nums"
                />
              </Field>
              <Field label="Price per unit" htmlFor="completion-price" hint="In INR">
                <Input
                  id="completion-price"
                  type="number"
                  inputMode="decimal"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                  min="0"
                  step="0.01"
                  className="tabular-nums"
                />
              </Field>

              <Field label="Warehouse" htmlFor="completion-warehouse" hint="Active wallets" className="sm:col-span-2">
                <Select value={formData.warehouseId} onValueChange={(value) => setFormData({...formData, warehouseId: value})}>
                  <SelectTrigger id="completion-warehouse">
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                  {wallets?.filter(w => w.is_active).map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name}
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Description" htmlFor="completion-description" className="sm:col-span-2">
                <Textarea
                  id="completion-description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Order completion notes"
                  rows={3}
                />
              </Field>
            </FieldGrid>
          </Group>

          <Group title="Amount" boxed bodyClassName="py-1.5 sm:py-2">
            <SummaryRow label="Order amount" value={fmtInr(order?.total_amount)} />
            <SummaryRow
              label="Quantity × price per unit"
              value={`${fmtAssetQty(formData.quantity, selectedProductView?.code)} × ${fmtRate(formData.price)}`}
              tone="muted"
            />
            <SummaryRow
              label="Final amount"
              value={fmtInr(totalAmount)}
              hint={
                Math.abs(amountGap) >= 0.01
                  ? `${fmtInr(Math.abs(amountGap))} ${amountGap > 0 ? 'more' : 'less'} than the order amount; the order is saved with the final amount.`
                  : undefined
              }
              strong
            />
          </Group>
        </DialogBody>

        <DialogFoot
          start={
            <span className="text-[13px] text-muted-foreground">
              Final amount <span className="font-semibold tabular-nums text-foreground">{fmtInr(totalAmount)}</span>
            </span>
          }
        >
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => completeOrderMutation.mutate()}
            disabled={completeOrderMutation.isPending || !formData.stockName}
          >
            {completeOrderMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Completing…
              </>
            ) : (
              'Complete order'
            )}
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The kit's Section, with its heading kept at 11px on phones: a global mobile rule in index.css
 * forces every h3 to 16px !important, which turns the small uppercase section labels into shouting.
 */
function Group({ title, ...rest }: ComponentProps<typeof Section>) {
  return <Section {...rest} title={title ? <span className="!text-[11px] !leading-4">{title}</span> : undefined} />;
}
