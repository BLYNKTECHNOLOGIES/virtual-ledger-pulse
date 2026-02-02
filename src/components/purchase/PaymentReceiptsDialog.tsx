import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Receipt, ExternalLink, X, ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentReceipt {
  id: string;
  order_id?: string;
  amount_paid: number;
  screenshot_url: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

interface PaymentReceiptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  payments: PaymentReceipt[];
}

export function PaymentReceiptsDialog({
  open,
  onOpenChange,
  orderNumber,
  payments,
}: PaymentReceiptsDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});

  // Filter payments that have screenshots
  const paymentsWithReceipts = payments.filter(p => p.screenshot_url);
  const currentPayment = paymentsWithReceipts[selectedIndex];

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handlePrevious = () => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => Math.min(paymentsWithReceipts.length - 1, prev + 1));
  };

  const handleImageError = (paymentId: string) => {
    setImageError((prev) => ({ ...prev, [paymentId]: true }));
  };

  if (paymentsWithReceipts.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment Receipts - {orderNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No payment receipts uploaded yet.</p>
            {payments.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {payments.length} payment(s) recorded without screenshots.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-500" />
            Payment Receipts - {orderNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Navigation and info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                Receipt {selectedIndex + 1} of {paymentsWithReceipts.length}
              </Badge>
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                {formatAmount(currentPayment.amount_paid)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(currentPayment.created_at), 'MMM dd, yyyy HH:mm')}
            </div>
          </div>

          {/* Image viewer */}
          <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
            {imageError[currentPayment.id] ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-2" />
                <p className="text-sm">Failed to load image</p>
                <a
                  href={currentPayment.screenshot_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
                >
                  Open in new tab <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <a
                href={currentPayment.screenshot_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={currentPayment.screenshot_url!}
                  alt={`Payment receipt for ${formatAmount(currentPayment.amount_paid)}`}
                  className="w-full max-h-[400px] object-contain cursor-zoom-in"
                  onError={() => handleImageError(currentPayment.id)}
                />
              </a>
            )}

            {/* Navigation arrows */}
            {paymentsWithReceipts.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background",
                    selectedIndex === 0 && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={handlePrevious}
                  disabled={selectedIndex === 0}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background",
                    selectedIndex === paymentsWithReceipts.length - 1 && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={handleNext}
                  disabled={selectedIndex === paymentsWithReceipts.length - 1}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>

          {/* Notes */}
          {currentPayment.notes && (
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground mb-1">Payment Notes:</p>
              <p className="text-sm">{currentPayment.notes}</p>
            </div>
          )}

          {/* All payments summary */}
          {payments.length > 1 && (
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-2">All Payments</p>
              <div className="grid gap-2">
                {payments.map((payment, idx) => {
                  const hasReceipt = !!payment.screenshot_url;
                  const receiptIndex = paymentsWithReceipts.findIndex(p => p.id === payment.id);
                  
                  return (
                    <div
                      key={payment.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border text-sm",
                        hasReceipt && receiptIndex === selectedIndex && "border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{formatAmount(payment.amount_paid)}</span>
                        {hasReceipt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setSelectedIndex(receiptIndex)}
                          >
                            <Receipt className="h-3 w-3 mr-1" />
                            View Receipt
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            No receipt
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(payment.created_at), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
