import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FieldDiff, PushResultEventDetail } from "@/lib/razorpayVerify";

const KIND_LABEL: Record<string, string> = {
  identity: "Identity & personal details",
  bank: "Bank details",
  employment: "Employment details",
  salary: "Salary / CTC",
  statutory: "Statutory enrollment (PF / ESI / PT)",
  dismissal: "Dismissal / separation",
};

function fmt(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return String(v);
}

function DiffRow({ f }: { f: FieldDiff }) {
  const ok = f.match === true;
  const accepted = f.accepted === true && f.match === null;
  const bad = f.match === false;
  const unknown = f.match === null && !accepted;
  return (
    <div className={cn(
      "flex flex-col gap-1 rounded-md border p-3 text-sm",
      ok && "border-emerald-500/30 bg-emerald-500/5",
      accepted && "border-amber-500/40 bg-amber-500/5",
      bad && "border-rose-500/40 bg-rose-500/5",
      unknown && "border-amber-500/30 bg-amber-500/5",
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          {ok && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {accepted && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          {bad && <XCircle className="h-4 w-4 text-rose-500" />}
          {unknown && <HelpCircle className="h-4 w-4 text-amber-500" />}
          <span>{f.label}</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wide",
            ok && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
            accepted && "border-amber-500/40 text-amber-600 dark:text-amber-400",
            bad && "border-rose-500/40 text-rose-600 dark:text-rose-400",
            unknown && "border-amber-500/40 text-amber-600 dark:text-amber-400",
          )}
        >
          {ok ? "Confirmed" : accepted ? "Push accepted" : bad ? "Not applied" : "Not verifiable"}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        <div className="rounded bg-background/70 px-2 py-1">
          <span className="text-muted-foreground">HRMS sent</span>
          <div className="mt-0.5 break-all font-mono text-foreground">{fmt(f.expected)}</div>
        </div>
        <div className="rounded bg-background/70 px-2 py-1">
          <span className="text-muted-foreground">RazorpayX shows</span>
          <div className="mt-0.5 break-all font-mono text-foreground">{fmt(f.actual)}</div>
        </div>
      </div>
      {f.reason && <div className="text-xs text-muted-foreground">{f.reason}</div>}
    </div>
  );
}

export function RazorpayPushResultDialog({
  open,
  onOpenChange,
  detail,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: PushResultEventDetail | null;
  onRetry?: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  const { confirmed, accepted, unapplied, unknown } = useMemo(() => {
    const fields = detail?.fields || [];
    return {
      confirmed: fields.filter((f) => f.match === true),
      accepted: fields.filter((f) => f.accepted === true && f.match === null),
      unapplied: fields.filter((f) => f.match === false),
      unknown: fields.filter((f) => f.match === null && f.accepted !== true),
    };
  }, [detail]);

  if (!detail) return null;
  const isFailed = detail.overall === "failed";
  const isPartial = detail.overall === "partial";
  const isAccepted = detail.overall === "accepted";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isFailed ? (
              <XCircle className="h-5 w-5 text-rose-500" />
            ) : isPartial || isAccepted ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            <DialogTitle>
              {isFailed
                ? "RazorpayX did NOT apply the update"
                : isAccepted
                ? "RazorpayX accepted the update; read-back is pending"
                : isPartial
                ? "RazorpayX update partially verified"
                : "RazorpayX update verified"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {KIND_LABEL[detail.kind] || detail.kind}
            {detail.employeeName ? ` · ${detail.employeeName}` : ""}
            {detail.razorpayEmployeeId ? ` · RazorpayX ID ${detail.razorpayEmployeeId}` : ""}
          </DialogDescription>
        </DialogHeader>

        {detail.error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">
            {detail.error}
          </div>
        )}

        <ScrollArea className="max-h-[55vh] pr-2">
          <div className="space-y-4">
            {unapplied.length > 0 && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                  Not applied by RazorpayX ({unapplied.length})
                </div>
                {unapplied.map((f) => <DiffRow key={f.key} f={f} />)}
              </section>
            )}
            {unknown.length > 0 && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-500">
                  Could not verify ({unknown.length})
                </div>
                {unknown.map((f) => <DiffRow key={f.key} f={f} />)}
              </section>
            )}
            {accepted.length > 0 && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-500">
                  Accepted by RazorpayX, read-back pending ({accepted.length})
                </div>
                {accepted.map((f) => <DiffRow key={f.key} f={f} />)}
              </section>
            )}
            {confirmed.length > 0 && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  Confirmed by RazorpayX ({confirmed.length})
                </div>
                {confirmed.map((f) => <DiffRow key={f.key} f={f} />)}
              </section>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            HRMS record was saved locally. "Push accepted" means RazorpayX accepted the write, but its API cannot echo that field yet.
          </div>
          <div className="flex gap-2">
            {(onRetry || detail.retry) && (
              <Button
                variant="outline"
                disabled={retrying}
                onClick={async () => {
                  try {
                    setRetrying(true);
                    if (onRetry) await onRetry();
                    else if (detail.retry) await detail.retry();
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Retry push
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
