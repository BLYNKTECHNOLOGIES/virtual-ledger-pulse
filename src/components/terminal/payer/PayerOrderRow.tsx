import { useState, useRef } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, BanknoteIcon, BotOff, Loader2, ClipboardCopy, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useMarkOrderAsPaid, useGetChatImageUploadUrl, callBinanceAds } from '@/hooks/useBinanceActions';
import { useExcludeFromAutoReply, useLogPayerAction } from '@/hooks/usePayerModule';
import { useQuery } from '@tanstack/react-query';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const statusStr = mapOrderStatusCode(order.orderStatus);
  const isOrderFinalized = ['COMPLETED', 'PAID', 'CANCELLED', 'EXPIRED'].includes(statusStr.toUpperCase());

  // Fetch order detail for payment methods
  const { data: orderDetail } = useQuery({
    queryKey: ['binance-order-detail-payer', order.orderNumber],
    queryFn: async () => {
      try {
        const resp = await callBinanceAds('getOrderDetail', { orderNumber: order.orderNumber });
        // Unwrap nested data: API may return { data: { ... } } or flat object
        return resp?.data || resp;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const payMethods = orderDetail?.payMethods || orderDetail?.payMethodList || orderDetail?.sellerPayMethod?.payMethods || [];

  const handleMarkPaid = async () => {
    setIsMarkingPaid(true);
    try {
      await markPaid.mutateAsync({ orderNumber: order.orderNumber });
      await logAction.mutateAsync({ orderNumber: order.orderNumber, action: 'marked_paid' });
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
      // Step 1: Get pre-signed upload URL
      const imageName = `${order.orderNumber}_${Date.now()}.jpg`;
      const result = await getUploadUrl.mutateAsync(imageName);
      const outer = result?.data || result;
      const inner = outer?.data || outer;
      const preSignedUrl = inner?.uploadUrl || inner?.preSignedUrl;
      const imageUrl = inner?.imageUrl || inner?.imageUr1;

      if (!preSignedUrl) throw new Error('Failed to get upload URL');
      if (!imageUrl) throw new Error('Failed to get image URL');

      // Step 2: Upload to S3
      const uploadResp = await fetch(preSignedUrl, { method: 'PUT', body: file });
      if (!uploadResp.ok) throw new Error(`Upload failed (${uploadResp.status})`);

      // Step 3: Send image to order chat
      await callBinanceAds('sendChatMessage', { orderNo: order.orderNumber, imageUrl });

      // Step 4: Mark as paid
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
          <span className="text-xs text-foreground font-mono underline decoration-muted-foreground/30 underline-offset-2">
            {order.orderNumber}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(order.orderNumber);
              toast.success('Order number copied');
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </TableCell>

      {/* Amount */}
      <TableCell className="py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-foreground tabular-nums font-medium">
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

      {/* Payment Details - inline */}
      <TableCell className="py-3">
        <PaymentDetailsInline payMethods={payMethods} />
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
        ) : (
          <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
            {/* Hidden file input for upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadAndMarkPaid}
            />

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
                  disabled={isMarkingPaid || isUploading}
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
          const copyText = `UPI: ${verifiedName} | ${upiId}`;
          return (
            <div key={idx} className="flex items-center gap-2 text-[10px]">
              <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary shrink-0">UPI</Badge>
              <span className="text-foreground font-medium truncate">{verifiedName || '—'}</span>
              <span className="text-muted-foreground truncate">{upiId || '—'}</span>
              <button onClick={(e) => copyPaymentDetails(e, copyText)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <ClipboardCopy className="h-3 w-3" />
              </button>
            </div>
          );
        }

        const accountNo = fieldMap['account number'] || fieldMap['account no'] || fieldMap['accountno'] || fieldMap['account'] || '';
        const ifsc = fieldMap['ifsc'] || fieldMap['ifsc code'] || fieldMap['ifsccode'] || '';
        const bankName = fieldMap['bank name'] || fieldMap['bankname'] || fieldMap['bank'] || tradeMethodName;
        const verifiedName = fieldMap['verified name'] || fieldMap['name'] || fieldMap['account holder'] || fieldMap['beneficiary'] || '';
        const copyText = `Bank: ${verifiedName} | A/C: ${accountNo} | IFSC: ${ifsc} | ${bankName}`;

        return (
          <div key={idx} className="flex items-center gap-2 text-[10px]">
            <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-500/30 text-emerald-500 shrink-0">Bank</Badge>
            <span className="text-foreground font-medium truncate">{verifiedName || '—'}</span>
            {accountNo && <span className="text-muted-foreground">A/C: {accountNo}</span>}
            {ifsc && <span className="text-muted-foreground">IFSC: {ifsc}</span>}
            {bankName && <span className="text-muted-foreground/70 truncate">{bankName}</span>}
            <button onClick={(e) => copyPaymentDetails(e, copyText)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ClipboardCopy className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
