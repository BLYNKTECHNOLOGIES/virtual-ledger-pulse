import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Clock, XCircle, CheckCircle, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogBody, DialogFoot, DialogHead, OrderNo, SalesStatusChip, dialogContentClass, fmtInr } from "@/components/orders-ui";

interface UserPayingStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  orderAmount: number;
  onStatusChange: (status: string) => void;
  onAlternativeMethod: () => void;
  /** Optional, display only: shown under the client name when the caller passes it. */
  orderNumber?: string | null;
}

export function UserPayingStatusDialog({
  open,
  onOpenChange,
  clientName,
  orderAmount,
  onStatusChange,
  onAlternativeMethod,
  orderNumber,
}: UserPayingStatusDialogProps) {
  const { toast } = useToast();

  const handleCancelled = () => {
    // Call onStatusChange first - it uses the order data before dialog closes
    onStatusChange("ORDER_CANCELLED");
    
    toast({
      title: "Order Cancelled",
      description: "Order has been cancelled and moved to leads.",
    });
    
    // Close dialog AFTER the status change is triggered
    // Note: onOpenChange triggers after mutation is dispatched
    setTimeout(() => {
      onOpenChange(false);
    }, 100);
  };

  const handlePaymentDone = () => {
    onStatusChange("PAYMENT_DONE");
    onOpenChange(false);
  };

  const handleAlternativeMethod = () => {
    onOpenChange(false);
    onAlternativeMethod();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("sm")}>
        <DialogHead
          icon={Clock}
          title="User payment status"
          description="The client is paying for this order. What happened?"
          meta={<SalesStatusChip status="USER_PAYING" />}
        />

        <DialogBody className="space-y-4">
          {/* The order this decision is about */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Client</div>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-foreground" title={clientName || undefined}>
                {clientName || "—"}
              </p>
              {orderNumber && <OrderNo value={orderNumber} className="block truncate" />}
            </div>
            <div className="text-right">
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Amount</div>
              <p className="mt-0.5 text-base font-semibold leading-5 tabular-nums text-foreground">{fmtInr(orderAmount)}</p>
            </div>
          </div>

          <div className="space-y-2" role="group" aria-label="What happened with the payment">
            <OutcomeRow
              icon={CheckCircle}
              tone="success"
              title="Payment done"
              description="The client has paid. Record the sale details next."
              onClick={handlePaymentDone}
            />
            <OutcomeRow
              icon={RefreshCw}
              title="Use another payment method"
              description="Show the client an alternative method to pay into."
              onClick={handleAlternativeMethod}
            />
            <OutcomeRow
              icon={XCircle}
              tone="danger"
              title="Cancel order"
              description="The client won't pay. This order is cancelled."
              onClick={handleCancelled}
            />
          </div>
        </DialogBody>

        <DialogFoot>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}

/* ── Presentation helper (private; same look as the option rows in StepBySalesFlow) ── */

type OutcomeTone = "neutral" | "success" | "danger";

const OUTCOME_ICON_TONE: Record<OutcomeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
};

function OutcomeRow({
  icon: Icon,
  title,
  description,
  onClick,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  onClick: () => void;
  tone?: OutcomeTone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left shadow-[var(--shadow-xs)] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        tone === "danger" ? "hover:border-destructive/40 hover:bg-destructive/5" : "hover:border-ring/40 hover:bg-muted/40",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", OUTCOME_ICON_TONE[tone])} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] font-semibold leading-5", tone === "danger" ? "text-destructive" : "text-foreground")}>{title}</span>
        <span className="block text-xs leading-[1.125rem] text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" aria-hidden />
    </button>
  );
}
