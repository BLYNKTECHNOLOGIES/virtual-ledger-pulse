import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Package, Clock, Coins } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { getCurrentUserId } from '@/lib/system-action-logger';
import { fetchCoinMarketRate } from '@/hooks/useCoinMarketRate';
import { formatSmartDecimal } from '@/lib/format-smart-decimal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: any;
}

export function SmallSalesApprovalDialog({ open, onOpenChange, record }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [coinUsdtRate, setCoinUsdtRate] = useState<number | null>(null);

  const assetCode = record?.asset_code || 'USDT';
  const isNonUsdt = assetCode !== 'USDT';

  // Fetch live CoinUSDT rate for non-USDT assets
  useEffect(() => {
    if (open && isNonUsdt) {
      fetchCoinMarketRate(assetCode).then(rate => setCoinUsdtRate(rate));
    }
  }, [open, assetCode, isNonUsdt]);
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods_bams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select('*')
        .eq('is_active', true)
        .order('nickname');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!record || !paymentMethodId) throw new Error('Select a payment method');

      // Fetch live CoinUSDT rate for non-USDT assets
      let marketRate: number | null = null;
      if (isNonUsdt) {
        marketRate = await fetchCoinMarketRate(assetCode);
      } else {
        marketRate = 1.0;
      }

      const userId = getCurrentUserId();

      // Generate SM order number using a simple counter approach
      const { count } = await supabase
        .from('small_sales_sync')
        .select('id', { count: 'exact', head: true })
        .eq('sync_status', 'approved');
      const seqNum = (count || 0) + 1;
      const orderNumber = `SM${String(seqNum).padStart(5, '0')}`;

      const selectedMethod = paymentMethods?.find(m => m.id === paymentMethodId);
      const isGateway = selectedMethod?.payment_gateway === true;

      // Create sales order
      const { data: salesOrder, error: soErr } = await supabase
        .from('sales_orders')
        .insert({
          order_number: orderNumber,
          client_name: 'Small Sales',
          client_phone: null,
          client_state: null,
          order_date: new Date().toISOString().split('T')[0],
          total_amount: record.total_amount,
          quantity: record.total_quantity,
          price_per_unit: record.avg_price,
          fee_percentage: 0,
          fee_amount: record.total_fee,
          net_amount: Number(record.total_amount) - Number(record.total_fee),
          payment_status: 'COMPLETED',
          settlement_status: isGateway ? 'PENDING' : 'DIRECT',
          status: 'approved',
          platform: 'Binance',
          asset: record.asset_code,
          wallet_id: record.wallet_id,
          source: 'terminal_small_sales',
          sale_type: 'small_sale',
          description: `Clubbed ${record.order_count} small ${record.asset_code} orders`,
          market_rate_usdt: marketRate,
        } as any)
        .select('id')
        .single();

      if (soErr || !salesOrder) throw soErr || new Error('Failed to create sales order');

      // Process wallet deduction for inventory
      if (record.wallet_id) {
        await supabase.rpc('process_sales_order_wallet_deduction', {
          sales_order_id: salesOrder.id,
          usdt_amount: Number(record.total_quantity),
          wallet_id: record.wallet_id,
          p_asset_code: record.asset_code,
        });
      }

      // Update sync record
      await supabase
        .from('small_sales_sync')
        .update({
          sync_status: 'approved',
          sales_order_id: salesOrder.id,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      return salesOrder;
    },
    onSuccess: () => {
      toast({ title: 'Approved', description: 'Small sales entry created in ERP' });
      queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['crypto_wallets'] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Approval failed', variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const userId = getCurrentUserId();
      await supabase
        .from('small_sales_sync')
        .update({
          sync_status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || 'Rejected by operator',
        })
        .eq('id', record.id);
    },
    onSuccess: () => {
      toast({ title: 'Rejected' });
      queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
      onOpenChange(false);
    },
  });

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Small Sales Bulk Approval
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Asset</span>
              <p className="font-semibold text-lg">{record.asset_code}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Orders Clubbed</span>
              <p className="font-semibold text-lg">{record.order_count}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Quantity</span>
              <p className="font-medium">{Number(record.total_quantity).toFixed(4)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Price</span>
              <p className="font-medium">₹{Number(record.avg_price).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Amount</span>
              <p className="font-semibold text-primary">₹{Number(record.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Fee</span>
              <p className="font-medium">{Number(record.total_fee).toFixed(4)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Wallet</span>
              <p className="font-medium">{record.wallet_name || 'N/A'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Time Window</span>
              <div className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {record.time_window_start && format(new Date(record.time_window_start), 'HH:mm')} –{' '}
                {record.time_window_end && format(new Date(record.time_window_end), 'HH:mm')}
              </div>
            </div>
          </div>

          {/* USDT Equivalent for non-USDT assets */}
          {isNonUsdt && coinUsdtRate && coinUsdtRate > 0 && (() => {
            const qty = Number(record.total_quantity || 0);
            const totalAmt = Number(record.total_amount || 0);
            const usdtEquivQty = qty * coinUsdtRate;
            const equivUsdtRate = usdtEquivQty > 0 ? totalAmt / usdtEquivQty : 0;
            return (
              <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5" />
                  USDT Equivalent (Live)
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-blue-700 dark:text-blue-500">{assetCode}/USDT</span>
                    <p className="font-medium text-blue-900 dark:text-blue-300">{formatSmartDecimal(coinUsdtRate, 6)}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 dark:text-blue-500">USDT Qty</span>
                    <p className="font-medium text-blue-900 dark:text-blue-300">{formatSmartDecimal(usdtEquivQty, 4)}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 dark:text-blue-500">USDT Rate</span>
                    <p className="font-medium text-blue-900 dark:text-blue-300">₹{formatSmartDecimal(equivUsdtRate, 2)}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          <Separator />

          <div>
            <Label>Payment Method *</Label>
            <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods?.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nickname || m.type} {m.payment_gateway ? '(Gateway)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showReject && (
            <div>
              <Label>Rejection Reason</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm"
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection..."
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!showReject ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowReject(true)}>
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                disabled={!paymentMethodId || approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowReject(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                Confirm Reject
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
