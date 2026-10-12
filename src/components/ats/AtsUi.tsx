import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StatusTone = "primary" | "success" | "warning" | "destructive" | "neutral";
const tones = {
  primary: { pill: "bg-primary/10 ring-primary/25", icon: "text-primary" },
  success: { pill: "bg-success/10 ring-success/25", icon: "text-success" },
  warning: { pill: "bg-warning/10 ring-warning/30", icon: "text-warning" },
  destructive: { pill: "bg-destructive/10 ring-destructive/25", icon: "text-destructive" },
  neutral: { pill: "bg-muted ring-border", icon: "text-muted-foreground" },
};
export function StatusPill({ tone, icon: Icon, children, className }: { tone: StatusTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-foreground ring-1 ring-inset", tones[tone].pill, className)}>
    {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", tones[tone].icon)} aria-hidden />}
    <span className="text-foreground">{children}</span>
  </span>;
}

export function MetricStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-border gap-px sm:grid-cols-3 xl:grid-cols-6", className)}>{children}</div>;
}
export function MetricCell({ label, value, helper, icon: Icon, onClick, valueClassName, children }: {
  label?: string; value?: ReactNode; helper?: ReactNode; icon?: LucideIcon; onClick?: () => void; valueClassName?: string; children?: ReactNode;
}) {
  const content = children ?? <>
    <div className="flex items-start justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">{label}{onClick && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}</span>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
    <div className={cn("mt-1 font-display text-[28px] font-semibold leading-8 tabular-nums text-foreground", valueClassName)}>{value}</div>
    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{helper}</div>
  </>;
  const cls = "min-w-0 bg-card px-4 py-3.5 text-left";
  return onClick ? <Button variant="ghost" onClick={onClick} className={cn(cls, "block h-auto whitespace-normal rounded-none hover:bg-muted/40 focus-visible:relative focus-visible:z-10 focus-visible:ring-inset focus-visible:ring-offset-0 [&_svg]:size-auto")}>{content}</Button> : <div className={cls}>{content}</div>;
}

export function CandidateAvatar({ full_name }: { full_name: string }) {
  const initials = full_name.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase();
  return <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-1 ring-border">{initials}</span>;
}
