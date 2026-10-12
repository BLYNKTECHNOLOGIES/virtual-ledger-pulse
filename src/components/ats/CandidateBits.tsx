import { CheckCircle2, CircleDot, PauseCircle, XCircle, LogOut, Star, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const APP_STATUS: Record<string, { label: string; icon: typeof CircleDot; cls: string }> = {
  active: { label: "Active", icon: CircleDot, cls: "text-primary" },
  on_hold: { label: "On hold", icon: PauseCircle, cls: "text-warning" },
  rejected: { label: "Rejected", icon: XCircle, cls: "text-destructive" },
  withdrawn: { label: "Withdrawn", icon: LogOut, cls: "text-muted-foreground" },
  hired: { label: "Hired", icon: CheckCircle2, cls: "text-success" },
};
export const appStatusLabel = (s?: string | null) => APP_STATUS[s ?? ""]?.label ?? "—";

export function AppStatusBadge({ status }: { status?: string | null }) {
  const s = APP_STATUS[status ?? ""] ?? APP_STATUS.active;
  const Icon = s.icon;
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap font-medium">
      <Icon className={cn("h-3 w-3 shrink-0", s.cls)} aria-hidden />
      {s.label}
    </Badge>
  );
}

export function Stars({ value, count, size = "sm" }: { value?: number | null; count?: number | null; size?: "sm" | "md" }) {
  if (!count) return <span className="text-xs text-muted-foreground">—</span>;
  const v = Number(value ?? 0);
  const cls = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${v.toFixed(1)} out of 5 from ${count} ratings`}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn(cls, i <= Math.round(v) ? "fill-warning text-warning" : "text-muted-foreground/40")} aria-hidden />
        ))}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">({count})</span>
    </span>
  );
}

export function UnreviewedDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" title="Not reviewed yet" aria-label="Not reviewed yet" />;
}

export function ResumeIcon({ show }: { show?: boolean | null }) {
  if (!show) return null;
  return <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has resume" />;
}

export const fmtYears = (n?: number | null) => (n == null ? "—" : `${Number(n)} ${Number(n) === 1 ? "yr" : "yrs"}`);
export const fmtMonthly = (n?: number | null) => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}/mo`);
export const isUnreviewed = (r: { status?: string | null; reviewed_at?: string | null }) => r.status === "active" && !r.reviewed_at;
