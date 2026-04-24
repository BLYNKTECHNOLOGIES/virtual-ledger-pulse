import { useState, useRef } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, BanknoteIcon, BotOff, Loader2, ClipboardCopy, ImageIcon, RefreshCw, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useMarkOrderAsPaid, useGetChatImageUploadUrl, callBinanceAds } from '@/hooks/useBinanceActions';
import { supabase } from '@/integrations/supabase/client';
import { useExcludeFromAutoReply, useLogPayerAction, useAlternateUpiRequest, useRequestAlternateUpi } from '@/hooks/usePayerModule';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QuickReceiveDialog, isQuickReceiveEligible } from '@/components/terminal/orders/QuickReceiveDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface PayerOrderRowProps {
  order: any;
  isExcluded: boolean;
  isCompleted?: boolean;
  onOpenOrder: () => void;
  onMarkPaidSuccess: () => void;
}

function mapOrderStatusCode(code: number | string): string {
  const map: Record<string, string> = {
    '1': 'Pending',
    '2': 'Paying',
    '3': 'Paid',
    '4': 'Completed',
    '5': 'Completed',
    '6': 'Cancelled',
    '7': 'Appeal',
    '8': 'Expired',
  };
  return map[String(code)] || String(code);
}

function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('pending') || s === '1') return 'border-amber-500/30 text-amber-500 bg-amber-500/5';
  if (s.includes('paying') || s === '2') return 'border-blue-500/30 text-blue-500 bg-blue-500/5';
  if (s.includes('paid') || s === '3') return 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5';
  return 'border-muted-foreground/30 text-muted-foreground bg-muted/5';
}

export function PayerOrderRow({ order, isExcluded, isCompleted, onOpenOrder, onMarkPaidSuccess }: PayerOrderRowProps) {
  const markPaid = useMarkOrderAsPaid();
  const excludeFromAuto = useExcludeFromAutoReply();
  const logAction = useLogPayerAction();
  const getUploadUrl = useGetChatImageUploadUrl();
  const requestAltUpi = useRequestAlternateUpi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Fetch alternate UPI request for this order
  const { data: altUpiRequest } = useAlternateUpiRequest(order.orderNumber);
  const hasPendingRequest = altUpiRequest?.status === 'pending';
  const hasResolvedOverride = altUpiRequest?.status === 'resolved' && altUpiRequest?.updated_upi_id;

  const statusStr = mapOrderStatusCode(order.orderStatus);
  const isOrderFinalized = ['COMPLETED', 'PAID', 'CANCELLED', 'EXPIRED'].includes(statusStr.toUpperCase());
  const isAlreadyPaidOrPaying = ['PAYING', 'PAID'].includes(statusStr.toUpperCase());
  // Order was paid externally (via Binance directly or automation).
  // Status 2 = TRADING-but-marked-paid; Status 3 = BUYER_PAYED ("Releasing" for BUY).
  // In both cases the seller still needs to release coins — Quick Receive applies.
  const isPaidExternally = ['2', '3'].includes(String(order.orderStatus)) && !isCompleted;

  // Fetch order detail for payment methods
  const { data: orderDetail } = useQuery({
    queryKey: ['binance-order-detail-payer', order.orderNumber],
    queryFn: async () => {
      try {
        const resp = await callBinanceAds('getOrderDetail', { orderNumber: order.orderNumber });
        return resp?.data || resp;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const payMethods = orderDetail?.payMethods || orderDetail?.payMethodList || orderDetail?.sellerPayMethod?.payMethods || [];
  const quickConfirmLimit = orderDetail?.quickConfirmAmountUpLimit;
  const queryClient = useQueryClient();
  const quickEligible = quickConfirmLimit !== undefined
    && isQuickReceiveEligible(order.totalPrice || 0, quickConfirmLimit);

  const handleMarkPaid = async () => {
    setIsMarkingPaid(true);
    try {
      await markPaid.mutateAsync({ orderNumber: order.orderNumber });
      const paidAtIso = new Date().toISOString();
      await logAction.mutateAsync({ orderNumber: order.orderNumber, action: 'marked_paid' });
      // Fire-and-forget: auto screenshot sender (eligibility checked server-side)
      supabase.functions.invoke('payer-auto-screenshot', {
        body: { orderNumber: order.orderNumber, paidAtIso },
      }).catch((e) => console.warn('auto-screenshot invoke failed', e));
      onMarkPaidSuccess();
    } catch {
      // Error handled by the hook
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleExcludeAuto = () => {
    excludeFromAuto.mutate(order.orderNumber);
  };

  // Acknowledge: log as acknowledged so it moves to completed and disappears from pending
  const handleAcknowledge = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAcknowledging(true);
    try {
      await logAction.mutateAsync({ orderNumber: order.orderNumber, action: 'marked_paid' });
      toast.success('Order acknowledged and removed from pending');
      onMarkPaidSuccess();
    } catch {
      toast.error('Failed to acknowledge order');
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleRequestAltUpi = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestAltUpi.mutate(order.orderNumber);
  };

  const handleUploadAndMarkPaid = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const imageName = `${order.orderNumber}_${Date.now()}.jpg`;
      const result = await getUploadUrl.mutateAsync(imageName);
      const outer = result?.data || result;
      const inner = outer?.data || outer;
      const preSignedUrl = inner?.uploadUrl || inner?.preSignedUrl;
      const imageUrl = inner?.imageUrl || inner?.imageUr1;

      if (!preSignedUrl) throw new Error('Failed to get upload URL');
      if (!imageUrl) throw new Error('Failed to get image URL');

      const uploadResp = await fetch(preSignedUrl, { method: 'PUT', body: file });
      if (!uploadResp.ok) throw new Error(`Upload failed (${uploadResp.status})`);

      await callBinanceAds('sendChatMessage', { orderNo: order.orderNumber, imageUrl });
      await markPaid.mutateAsync({ orderNumber: order.orderNumber });
      await logAction.mutateAsync({ orderNumber: order.orderNumber, action: 'marked_paid' });

      toast.success('Screenshot uploaded & marked as paid');
      onMarkPaidSuccess();
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <TableRow
      className="border-border cursor-pointer hover:bg-secondary/40 transition-colors"
      onClick={onOpenOrder}
    >
      {/* Date */}
      <TableCell className="py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-foreground">
            <span className="text-trade-buy font-semibold">Buy</span> {order.asset || 'USDT'}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {order.createTime ? format(new Date(order.createTime), 'yyyy-MM-dd HH:mm') : '—'}
          </span>
        </div>
      </TableCell>

      {/* Order No */}
      <TableCell className="py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs text-foreground font-mono underline decoration-muted-foreground/30 underline-offset-2 cursor-pointer hover:text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(order.orderNumber);
              toast.success('Order number copied');
            }}
          >
            {order.orderNumber}
          </span>
        </div>
      </TableCell>

      {/* Amount */}
      <TableCell className="py-3">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-xs text-foreground tabular-nums font-medium cursor-pointer hover:text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const intAmount = Math.floor(Number(order.totalPrice || 0)).toString();
              navigator.clipboard.writeText(intAmount);
              toast.success(`Amount ₹${intAmount} copied`);
            }}
          >
            {Number(order.totalPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {order.fiat || 'INR'}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {Number(order.amount || 0).toFixed(2)} {order.asset || 'USDT'}
          </span>
        </div>
      </TableCell>

      {/* Counterparty */}
      <TableCell className="py-3">
        <span className="text-xs text-foreground font-medium truncate max-w-[120px] block">
          {order.sellerNickname || order.counterPartNickName || '—'}
        </span>
      </TableCell>

      {/* Payment Details - with override support */}
      <TableCell className="py-3">
        {hasResolvedOverride ? (
          <OverrideUpiDisplay
            upiId={altUpiRequest.updated_upi_id}
            upiName={altUpiRequest.updated_upi_name}
            payMethod={altUpiRequest.updated_pay_method}
          />
        ) : (
          <PaymentDetailsInline payMethods={payMethods} />
        )}
      </TableCell>

      {/* Status */}
      <TableCell className="py-3">
        {isCompleted ? (
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500 bg-emerald-500/5">
            Marked Paid
          </Badge>
        ) : (
          <Badge variant="outline" className={`text-[10px] ${getStatusBadgeClass(String(order.orderStatus))}`}>
            {statusStr}
          </Badge>
        )}
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3 text-right">
        {isCompleted || isOrderFinalized ? (
          <span className="text-[10px] text-muted-foreground italic">—</span>
        ) : isPaidExternally ? (
          <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 bg-amber-500/5 mr-1">
              Paid Externally
            </Badge>
            {/* Quick Receive — only when Binance allows for this order */}
            {quickEligible && (
              <QuickReceiveDialog
                orderNumber={order.orderNumber}
                totalPrice={order.totalPrice || 0}
                quickConfirmAmountUpLimit={quickConfirmLimit}
                asset={order.asset || 'USDT'}
                fiatUnit={order.fiat || 'INR'}
                advNo={order.advNo}
                source="payer"
                variant="inline"
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
                  onMarkPaidSuccess();
                }}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 px-2.5 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
            >
              {isAcknowledging ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
              Acknowledge
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 justify-end flex-wrap" onClick={(e) => e.stopPropagation()}>
            {/* Hidden file input for upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadAndMarkPaid}
            />

            {/* Quick Receive — also available on pending rows when Binance allows.
                Operator must have already sent fiat; this marks paid + auto-releases via security deposit. */}
            {quickEligible && (
              <QuickReceiveDialog
                orderNumber={order.orderNumber}
                totalPrice={order.totalPrice || 0}
                quickConfirmAmountUpLimit={quickConfirmLimit}
                asset={order.asset || 'USDT'}
                fiatUnit={order.fiat || 'INR'}
                advNo={order.advNo}
                source="payer"
                variant="inline"
                requireMarkPaidFirst={!isAlreadyPaidOrPaying}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
                  onMarkPaidSuccess();
                }}
              />
            )}

            {/* Copy Payment String */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 px-2"
              onClick={(e) => {
                e.stopPropagation();
                const phone = (order.orderNumber || '').slice(0, 10);
                const amount = Math.floor(Number(order.totalPrice || 0)).toString();
                let upiId = '';
                let name = '';
                const methods = hasResolvedOverride
                  ? [{ fields: [{ fieldName: 'UPI ID', fieldValue: altUpiRequest.updated_upi_id }, { fieldName: 'Name', fieldValue: altUpiRequest.updated_upi_name }] }]
                  : payMethods;
                for (const m of (methods || [])) {
                  for (const f of (m.fields || [])) {
                    const fn = (f.fieldName || '').toLowerCase();
                    if (!upiId && (fn.includes('upi') || fn.includes('id') || fn.includes('vpa'))) upiId = f.fieldValue || '';
                    if (!name && (fn.includes('name') || fn.includes('holder'))) name = f.fieldValue || '';
                  }
                }
                const str = `${phone}|${upiId}|${name}|${amount}|0717`;
                navigator.clipboard.writeText(str);
                toast.success('Payment string copied');
              }}
            >
              <ClipboardCopy className="h-3 w-3" />
              Copy Info
            </Button>

            {/* Request Another UPI */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 px-2"
              onClick={handleRequestAltUpi}
              disabled={hasPendingRequest || requestAltUpi.isPending}
            >
              {requestAltUpi.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {hasPendingRequest ? 'Requested' : 'Alt UPI'}
            </Button>

            {/* Remove from Auto */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 px-2"
              onClick={handleExcludeAuto}
              disabled={isExcluded || excludeFromAuto.isPending}
            >
              <BotOff className="h-3 w-3" />
              {isExcluded ? 'Removed' : 'Remove Auto'}
            </Button>

            {/* Upload & Mark Paid */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 px-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isMarkingPaid}
            >
              {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>

            {/* Mark Paid */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-[10px] gap-1 px-2 bg-trade-buy hover:bg-trade-buy/90"
                  disabled={isMarkingPaid || isUploading || isAlreadyPaidOrPaying}
                >
                  {isMarkingPaid ? <Loader2 className="h-3 w-3 animate-spin" /> : <BanknoteIcon className="h-3 w-3" />}
                  Mark Paid
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Mark as Paid</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to mark order <strong>{order.orderNumber}</strong> as paid?
                    Amount: <strong>{Number(order.totalPrice || 0).toLocaleString('en-IN')} {order.fiat || 'INR'}</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleMarkPaid}>Confirm</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Shows the operator-provided override UPI details */
function OverrideUpiDisplay({ upiId, upiName, payMethod }: { upiId: string; upiName?: string; payMethod?: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary shrink-0">
        {payMethod || 'UPI'} <span className="ml-0.5 text-[7px] opacity-70">Updated</span>
      </Badge>
      {upiName && (
        <span
          className="text-foreground font-medium truncate cursor-pointer hover:text-primary transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(upiName);
            toast.success('Name copied');
          }}
          title="Click to copy name"
        >
          {upiName}
        </span>
      )}
      <span
        className="text-muted-foreground truncate cursor-pointer hover:text-primary transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(upiId);
          toast.success('UPI ID copied');
        }}
        title="Click to copy UPI ID"
      >
        {upiId}
      </span>
    </div>
  );
}

function PaymentDetailsInline({ payMethods }: { payMethods: any[] }) {
  if (!payMethods || payMethods.length === 0) {
    return <span className="text-[10px] text-muted-foreground italic">Loading...</span>;
  }

  const copyPaymentDetails = (e: React.MouseEvent, details: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(details);
    toast.success('Payment details copied');
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {payMethods.map((pm: any, idx: number) => {
        const fields = pm.fields || [];
        const tradeMethodName = pm.tradeMethodName || pm.payType || pm.identifier || '';
        const isUPI = tradeMethodName.toLowerCase().includes('upi') || tradeMethodName.toLowerCase().includes('paytm');

        const fieldMap: Record<string, string> = {};
        for (const f of fields) {
          const name = (f.fieldName || f.name || '').toLowerCase();
          fieldMap[name] = f.fieldValue || f.value || '';
        }

        if (isUPI) {
          const upiId = fieldMap['upi id'] || fieldMap['upi_id'] || fieldMap['upiid'] || fieldMap['id'] || '';
          const verifiedName = fieldMap['verified name'] || fieldMap['name'] || fieldMap['account holder'] || '';
          return (
            <div key={idx} className="flex items-center gap-2 text-[10px]">
              <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary shrink-0">UPI</Badge>
              <span
                className="text-foreground font-medium truncate cursor-pointer hover:text-primary transition-colors"
                onClick={(e) => copyPaymentDetails(e, verifiedName)}
                title="Click to copy name"
              >
                {verifiedName || '—'}
              </span>
              <span
                className="text-muted-foreground truncate cursor-pointer hover:text-primary transition-colors"
                onClick={(e) => copyPaymentDetails(e, upiId)}
                title="Click to copy UPI ID"
              >
                {upiId || '—'}
              </span>
            </div>
          );
        }

        const accountNo = fieldMap['account number'] || fieldMap['account no'] || fieldMap['accountno'] || fieldMap['account'] || '';
        const ifsc = fieldMap['ifsc'] || fieldMap['ifsc code'] || fieldMap['ifsccode'] || '';
        const bankName = fieldMap['bank name'] || fieldMap['bankname'] || fieldMap['bank'] || tradeMethodName;
        const verifiedName = fieldMap['verified name'] || fieldMap['name'] || fieldMap['account holder'] || fieldMap['beneficiary'] || '';

        return (
          <div key={idx} className="flex items-center gap-2 text-[10px]">
            <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-500/30 text-emerald-500 shrink-0">Bank</Badge>
            <span
              className="text-foreground font-medium truncate cursor-pointer hover:text-primary transition-colors"
              onClick={(e) => copyPaymentDetails(e, verifiedName)}
              title="Click to copy name"
            >
              {verifiedName || '—'}
            </span>
            {accountNo && (
              <span
                className="text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                onClick={(e) => copyPaymentDetails(e, accountNo)}
                title="Click to copy account number"
              >
                A/C: {accountNo}
              </span>
            )}
            {ifsc && <span className="text-muted-foreground">IFSC: {ifsc}</span>}
            {bankName && <span className="text-muted-foreground/70 truncate">{bankName}</span>}
          </div>
        );
      })}
    </div>
  );
}
