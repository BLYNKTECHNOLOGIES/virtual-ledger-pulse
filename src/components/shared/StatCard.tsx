import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeltaTone = "positive" | "negative" | "neutral";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Numeric delta rendered as a signed percentage with a directional arrow. */
  deltaPercent?: number;
  /** Plain helper line shown when no deltaPercent is supplied. */
  helper?: ReactNode;
  helperTone?: DeltaTone;
  loading?: boolean;
  className?: string;
}

const TONE: Record<DeltaTone, string> = {
  positive: "text-success",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
};

/**
 * StatCard — ERP KPI surface.
 * Neutral icon chip, tabular KPI value, semantic color reserved for the
 * delta/helper line only. Presentation only.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  deltaPercent,
  helper,
  helperTone = "neutral",
  loading,
  className,
}: StatCardProps) {
  const hasDelta = typeof deltaPercent === "number" && Number.isFinite(deltaPercent);
  const up = hasDelta ? (deltaPercent as number) >= 0 : true;
  const tone: DeltaTone = hasDelta ? (up ? "positive" : "negative") : helperTone;

  return (
    <div
      className={cn(
        "ds-surface ds-surface-interactive h-full p-4 md:p-5 flex flex-col justify-between gap-3",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="t-label truncate">{label}</p>
        {Icon && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      {loading ? (
        <div className="skeleton-shimmer h-8 w-28 rounded-md bg-muted" />
      ) : (
        <div className="t-kpi text-foreground break-words leading-tight">{value}</div>
      )}

      <div className={cn("flex items-center gap-1.5 text-[13px] font-medium", TONE[tone])}>
        {hasDelta ? (
          <>
            {up ? <ArrowUpIcon className="h-3.5 w-3.5" /> : <ArrowDownIcon className="h-3.5 w-3.5" />}
            <span className="tabular-nums">
              {up ? "+" : ""}
              {(deltaPercent as number).toFixed(1)}%
            </span>
            <span className="text-muted-foreground font-normal">vs previous</span>
          </>
        ) : (
          helper && <span className="truncate">{helper}</span>
        )}
      </div>
    </div>
  );
}

export default StatCard;
