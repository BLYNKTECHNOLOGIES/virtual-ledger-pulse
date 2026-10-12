import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Hourglass } from "lucide-react";
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
    <div className="flex !flex-nowrap items-start justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">{label}{onClick && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}</span>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
    <div className={cn("mt-1 font-display text-[28px] font-semibold leading-8 tabular-nums text-foreground", valueClassName)}>{value}</div>
    <div className="mt-0.5 min-h-4 text-xs leading-4 text-muted-foreground tabular-nums">{helper}</div>
  </>;
  const cls = "min-w-0 bg-card px-4 py-3.5 text-left";
  return onClick ? <Button variant="ghost" onClick={onClick} className={cn(cls, "block h-auto whitespace-normal rounded-none hover:bg-muted/40 focus-visible:relative focus-visible:z-10 focus-visible:ring-inset focus-visible:ring-offset-0 [&_svg]:!size-4")}>{content}</Button> : <div className={cls}>{content}</div>;
}

export function CandidateAvatar({ full_name, size = "md" }: { full_name: string; size?: "sm" | "md" | "lg" }) {
  const initials = (full_name ?? "").trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase();
  const sz = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  return <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground ring-1 ring-border", sz)}>{initials}</span>;
}

const STAGE_KIND: Record<string, { pill: string; dot: string }> = {
  new: { pill: "bg-muted", dot: "bg-muted-foreground/60" },
  screening: { pill: "bg-primary/10", dot: "bg-primary/40" },
  assessment: { pill: "bg-primary/15", dot: "bg-primary/60" },
  interview: { pill: "bg-primary/20", dot: "bg-primary/80" },
  offer: { pill: "bg-primary/25", dot: "bg-primary" },
  hired: { pill: "bg-success/15", dot: "bg-success" },
};
const stageKind = (kind?: string | null) => STAGE_KIND[kind ?? ""] ?? STAGE_KIND.new;
export const stageDotClass = (kind?: string | null) => stageKind(kind).dot;

export function StageChip({ name, kind, className }: { name?: string | null; kind?: string | null; className?: string }) {
  const k = stageKind(kind);
  return <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-foreground", k.pill, className)}>
    <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", k.dot)} />{name ?? "—"}
  </span>;
}

export type RailStage = { id: string; name: string; kind?: string | null };
export function StageRail({ stages, currentId, status, size = "lg" }: { stages: RailStage[]; currentId?: string | null; status?: string | null; size?: "sm" | "lg" }) {
  const at = stages.findIndex((s) => s.id === currentId);
  const closed = status === "rejected" || status === "withdrawn";
  const seg = (s: RailStage, i: number) => {
    if (at >= 0 && i < at) return closed ? "bg-muted-foreground/30" : "bg-primary/50";
    if (i === at) return closed ? "bg-muted-foreground/60" : status === "on_hold" ? "bg-warning" : s.kind === "hired" ? "bg-success" : "bg-primary";
    return "bg-muted ring-1 ring-inset ring-border";
  };
  if (size === "sm") return <span aria-hidden className="flex w-16 shrink-0 gap-0.5">{stages.map((s, i) => <span key={s.id} className={cn("h-1 flex-1 rounded-full", seg(s, i))} />)}</span>;
  return <ol aria-label="Stages" className="flex gap-1">
    {stages.map((s, i) => <li key={s.id} aria-current={i === at ? "step" : undefined} className="min-w-0 flex-1">
      <span aria-hidden className={cn("block h-1.5 rounded-full", seg(s, i))} />
      <span lang="en" className={cn("mt-1.5 line-clamp-2 break-words hyphens-auto text-[11px] leading-tight", i === at ? "font-semibold text-foreground" : "text-muted-foreground")} title={s.name}>{s.name}</span>
    </li>)}
  </ol>;
}

export function IdleDays({ days, idle, idleDays, suffix = "" }: { days?: number | null; idle: boolean; idleDays: number; suffix?: string }) {
  const n = days ?? 0;
  const title = `No movement for ${n} days (alert after ${idleDays})`;
  if (!idle) return <span className="whitespace-nowrap tabular-nums" title={title}>{n}{suffix}</span>;
  return <span title={title} className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-warning/10 px-2 text-xs font-medium tabular-nums text-foreground ring-1 ring-inset ring-warning/30">
    <Hourglass className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />{n}{suffix}
  </span>;
}

/** Section heading inside the candidate forms. */
export function FormSection({ title }: { title: string }) {
  return <h3 className="mb-2 mt-4 text-xs font-semibold text-muted-foreground first:mt-0">{title}</h3>;
}
/** Required-field marker. */
export function Req() {
  return <><span aria-hidden className="text-destructive"> *</span><span className="sr-only"> required</span></>;
}
