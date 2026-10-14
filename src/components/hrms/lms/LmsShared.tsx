import { useState, type ReactNode } from "react";
import {
  AlertTriangle, BookOpen, CheckCircle2, Circle, ClipboardCheck, Dumbbell, Headset, Loader2, Lock, RefreshCw, StickyNote,
  XCircle, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  CERT_STATUS_LABEL, MODULE_STATUS_LABEL, MODULE_STATUS_VARIANT, PLAN_KRA_STATUS_LABEL, PLAN_STATUS_LABEL, PLAN_STATUS_VARIANT,
} from "@/lib/lms/constants";
import type { LmsCertStatus, LmsItemType, LmsModuleStatus, LmsPlanKraStatus, LmsPlanStatus } from "@/lib/lms/types";

export function PlanStatusBadge({ status }: { status: LmsPlanStatus }) {
  return <Badge variant={PLAN_STATUS_VARIANT[status]} dot>{PLAN_STATUS_LABEL[status]}</Badge>;
}

export function ModuleStatusBadge({ status }: { status: LmsModuleStatus }) {
  return <Badge variant={MODULE_STATUS_VARIANT[status]} dot>{MODULE_STATUS_LABEL[status]}</Badge>;
}

const CERT_VARIANT: Record<LmsCertStatus, "success" | "warning" | "destructive-soft"> = {
  certified: "success", refresher_due: "warning", revoked: "destructive-soft",
};
export function CertStatusBadge({ status }: { status: LmsCertStatus }) {
  return <Badge variant={CERT_VARIANT[status]} dot>{CERT_STATUS_LABEL[status]}</Badge>;
}

const PLAN_KRA_VARIANT: Record<LmsPlanKraStatus, "info" | "success" | "destructive-soft"> = {
  in_training: "info", certified: "success", not_cleared: "destructive-soft",
};
export function PlanKraBadge({ status }: { status: LmsPlanKraStatus }) {
  return <Badge variant={PLAN_KRA_VARIANT[status]} dot>{PLAN_KRA_STATUS_LABEL[status]}</Badge>;
}

const ITEM_ICON: Record<LmsItemType, LucideIcon> = {
  module: BookOpen, test: ClipboardCheck, practice: Dumbbell, live: Headset, note: StickyNote,
};
export function ItemTypeIcon({ type, className }: { type: LmsItemType; className?: string }) {
  const Icon = ITEM_ICON[type] ?? Circle;
  return <Icon className={cn("h-4 w-4 shrink-0 text-muted-foreground", className)} aria-hidden />;
}

/** Done / failed / pending marker following the HRMS status convention (icon + semantic colour). */
export function StateIcon({ state, label }: { state: "done" | "failed" | "pending" | "skipped"; label?: string }) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label={label ?? "Done"} />;
  if (state === "failed") return <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-label={label ?? "Failed"} />;
  if (state === "skipped") return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-label={label ?? "Skipped"} />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={label ?? "Pending"} />;
}

export function KpiCard({
  label, value, hint, icon: Icon, tone = "default", onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "info" | "destructive";
  onClick?: () => void;
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];
  const body = (
    <CardContent className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="t-label">{label}</p>
        <p className="t-kpi mt-1">{value}</p>
        {hint ? <p className="t-secondary mt-0.5">{hint}</p> : null}
      </div>
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </div>
    </CardContent>
  );
  if (!onClick) return <Card>{body}</Card>;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Card>
  );
}

export function ProgressLine({ done, total, className }: { done: number; total: number; className?: string }) {
  const value = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Progress value={value} className="h-1.5 flex-1" aria-label={`${value}% done`} />
      <span className="t-mono w-9 shrink-0 text-right text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error ?? "Something went wrong");
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="text-sm font-medium">Couldn't load this</p>
            <p className="t-secondary break-words">{message}</p>
          </div>
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ReadOnlyNote({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children ?? "You can view the LMS. Changes need the LMS Manage permission."}</span>
    </div>
  );
}

export function SectionTitle({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="t-section">{title}</h2>
        {description ? <p className="t-secondary mt-0.5">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A button that asks for confirmation before running an action. */
export function ConfirmAction({
  title, description, confirmLabel = "Confirm", destructive, onConfirm, children, disabled,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  children: (open: () => void) => ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      {children(() => !disabled && setOpen(true))}
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description ? <AlertDialogDescription asChild><div className="text-sm text-muted-foreground">{description}</div></AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Small labelled value for detail headers. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="t-label">{label}</p>
      <div className="mt-0.5 truncate text-sm">{children}</div>
    </div>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
