import { useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Building, Copy, Clock, CheckCircle, Check, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, DialogBody, DialogFoot, DialogHead, PanelMessage, PanelSkeleton, dialogContentClass, fmtInr } from "@/components/orders-ui";

interface PaymentMethodSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderAmount: number;
  clientName: string;
  orderId: string;
  riskCategory: string;
  paymentType: 'UPI' | 'Bank Transfer';
  onStatusChange: (status: string, paymentMethodId?: string) => void;
}

export function PaymentMethodSelectionDialog({ 
  open, 
  onOpenChange, 
  orderAmount,
  clientName,
  orderId,
  riskCategory,
  paymentType,
  onStatusChange
}: PaymentMethodSelectionDialogProps) {
  const { toast } = useToast();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);

  // Fetch available payment methods
  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['sales_payment_methods', riskCategory, paymentType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(
            account_name,
            bank_name,
            account_number,
            IFSC,
            bank_account_holder_name,
            status
          )
        `)
        .eq('is_active', true)
        .eq('risk_category', riskCategory)
        .eq('type', paymentType === 'UPI' ? 'UPI' : 'Bank Account');

      if (error) throw error;
      
      // Filter methods that have available capacity AND active bank accounts
      const filteredData = (data || []).filter(method => 
        method.current_usage < method.payment_limit &&
        method.bank_accounts?.status === 'ACTIVE'
      );
      
      return filteredData;
    },
    enabled: open
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Payment details copied to clipboard" });
  };

  const handleUserPaying = () => {
    if (!selectedPaymentMethod) {
      toast({ title: "Error", description: "Please select a payment method", variant: "destructive" });
      return;
    }
    onStatusChange("USER_PAYING", selectedPaymentMethod.id);
    onOpenChange(false);
  };

  const handlePaymentDone = () => {
    if (!selectedPaymentMethod) {
      toast({ title: "Error", description: "Please select a payment method", variant: "destructive" });
      return;
    }
    onStatusChange("PAYMENT_DONE", selectedPaymentMethod.id);
    onOpenChange(false);
  };

  /* ── Presentation ─────────────────────────────────────────────────────── */

  // Roving focus: the selected row (or the first one) is the group's tab stop.
  const selectedInList = !!paymentMethods?.some((m: any) => m.id === selectedPaymentMethod?.id);

  const renderPaymentMethodCard = (method: any, index: number) => {
    const checked = selectedPaymentMethod?.id === method.id;
    const available = method.payment_limit - method.current_usage;
    const usedPct = method.payment_limit > 0 ? Math.min(100, Math.max(0, (method.current_usage / method.payment_limit) * 100)) : 0;
    const TypeIcon = method.type === 'UPI' ? CreditCard : Building;
    return (
      <div
        key={method.id}
        className={cn(
          "cursor-pointer rounded-lg border bg-card transition-colors",
          checked ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-ring/40 hover:bg-muted/30",
        )}
        onClick={() => setSelectedPaymentMethod(method)}
      >
        <button
          type="button"
          role="radio"
          aria-checked={checked}
          tabIndex={checked || (!selectedInList && index === 0) ? 0 : -1}
          className="flex w-full min-w-0 items-start gap-3 rounded-lg px-3 pb-2 pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
        >
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-background",
            )}
            aria-hidden
          >
            {checked && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-5 text-foreground">
              {method.bank_accounts ? method.bank_accounts.account_name : method.type}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <TypeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {method.type}
                {method.nickname ? ` · ${method.nickname}` : ""}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[13px] font-semibold tabular-nums text-foreground">{fmtInr(available)}</span>
            <span className="block text-[11px] text-muted-foreground">available</span>
          </span>
        </button>

        <div className="space-y-2.5 px-3 pb-3 pl-10 sm:px-4 sm:pl-11">
          {method.type === 'UPI' && method.upi_id && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 py-1 pl-2.5 pr-1">
              <div className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">UPI ID</span>
                <span className="block break-all font-mono text-[12px] text-foreground">{method.upi_id}</span>
              </div>
              <CopyIconButton
                label="Copy UPI ID"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(method.upi_id);
                }}
              />
            </div>
          )}

          {method.type === 'Bank Account' && method.bank_accounts && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Bank</dt>
                <dd className="truncate text-[13px] font-medium text-foreground">{method.bank_accounts.bank_name}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Name</dt>
                <dd className="truncate text-[13px] font-medium text-foreground">{method.bank_accounts.bank_account_holder_name}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Account</dt>
                <dd className="flex items-center gap-1">
                  <span className="min-w-0 break-all font-mono text-[12px] text-foreground">{method.bank_accounts.account_number}</span>
                  <CopyIconButton
                    label="Copy account number"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(method.bank_accounts.account_number);
                    }}
                  />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">IFSC</dt>
                <dd className="flex items-center gap-1">
                  <span className="min-w-0 break-all font-mono text-[12px] text-foreground">{method.bank_accounts.IFSC}</span>
                  <CopyIconButton
                    label="Copy IFSC"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(method.bank_accounts.IFSC);
                    }}
                  />
                </dd>
              </div>
            </dl>
          )}

          <div className="flex items-center gap-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10" role="img" aria-label={`${Math.round(usedPct)}% of the limit used`}>
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${usedPct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              Used {fmtInr(method.current_usage)} of {fmtInr(method.payment_limit)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("lg")}>
        <DialogHead
          icon={WalletCards}
          title="Select payment method"
          description={
            <>
              Choose the account {clientName ? <span className="font-medium text-foreground">{clientName}</span> : "the client"} pays{" "}
              <span className="font-medium tabular-nums text-foreground">{fmtInr(orderAmount)}</span> into. User paying keeps the order
              open while the client pays; payment done marks it paid.
            </>
          }
          meta={
            <>
              <Chip tone="neutral">{paymentType}</Chip>
              <Chip tone="neutral">Risk: {riskCategory}</Chip>
            </>
          }
        />

        <DialogBody>
          {isLoading ? (
            <PanelSkeleton rows={3} label="Loading payment methods" />
          ) : paymentMethods && paymentMethods.length > 0 ? (
            <div role="radiogroup" aria-label="Payment methods" className="space-y-2.5" onKeyDown={moveRadioFocus}>
              {paymentMethods.map(renderPaymentMethodCard)}
            </div>
          ) : (
            <PanelMessage icon={WalletCards} title="No payment method available" className="rounded-lg border border-dashed border-border py-10">
              No active {paymentType} method for risk category “{riskCategory}” has an active bank account and room under its limit.
              Ask an admin to add one, then try again.
            </PanelMessage>
          )}
        </DialogBody>

        <DialogFoot>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleUserPaying}
            disabled={!selectedPaymentMethod}
          >
            <Clock className="h-4 w-4" />
            Mark as user paying
          </Button>
          <Button
            onClick={handlePaymentDone}
            disabled={!selectedPaymentMethod}
          >
            <CheckCircle className="h-4 w-4" />
            Mark payment done
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}

/* ── Presentation helpers (private) ───────────────────────────────────── */

/** Icon-only copy button with a 32px tap target; runs the caller's own copy handler. */
function CopyIconButton({ label, onClick }: { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground" onClick={onClick} aria-label={label} title={label}>
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

/** Arrow keys move between the radios of a group and select, like native radio buttons. */
function moveRadioFocus(e: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const i = radios.indexOf(document.activeElement as HTMLElement);
  if (i === -1) return;
  e.preventDefault();
  const next = radios[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  next.click();
}
