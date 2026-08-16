import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ResponsiveContainer } from "recharts";

/* Shared content atoms so widget internals share one visual language. */

export type SemanticTone = "neutral" | "primary" | "success" | "warning" | "destructive";

const TONE_TEXT: Record<SemanticTone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const TONE_CHIP: Record<SemanticTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

/** WidgetMetric — muted label, prominent value, optional supporting line/delta. */
export function WidgetMetric({
  label,
  value,
  helper,
  delta,
  tone = "neutral",
  align = "start",
  size = "md",
  className,
}: {
  label?: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  /** Signed percentage change; sign drives the semantic color and the arrow glyph. */
  delta?: number | null;
  tone?: SemanticTone;
  align?: "start" | "center";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const valueSize =
    size === "lg" ? "text-[28px]" : size === "sm" ? "text-lg" : "text-2xl";
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        align === "center" && "items-center text-center",
        className
      )}
    >
      {label && (
        <p className="truncate text-[11.5px] font-medium leading-tight text-muted-foreground">
          {label}
        </p>
      )}
      <p
        className={cn(
          "truncate font-semibold leading-tight tracking-tight tabular-nums",
          valueSize,
          TONE_TEXT[tone]
        )}
      >
        {value}
      </p>
      {(helper || delta != null) && (
        <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
          {delta != null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-[1px] text-[10.5px] font-semibold tabular-nums",
                up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              )}
            >
              <span aria-hidden>{up ? "↑" : "↓"}</span>
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {helper && <span className="truncate text-muted-foreground">{helper}</span>}
        </div>
      )}
    </div>
  );
}

/** WidgetListRow — leading chip, two-line left block, right-aligned figure. */
export function WidgetListRow({
  icon: Icon,
  iconTone = "neutral",
  title,
  subtitle,
  value,
  valueTone = "neutral",
  meta,
  trailing,
  onClick,
  className,
}: {
  icon?: LucideIcon;
  iconTone?: SemanticTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  valueTone?: SemanticTone;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 motion-reduce:transition-none",
        onClick && "cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {Icon && (
        <span
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            iconTone === "neutral" ? "text-muted-foreground" : TONE_CHIP[iconTone]
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-foreground">{title}</p>
        {subtitle && (
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {(value != null || meta) && (
        <div className="shrink-0 text-right">
          {value != null && (
            <p className={cn("text-[13px] font-semibold tabular-nums", TONE_TEXT[valueTone])}>
              {value}
            </p>
          )}
          {meta && <p className="text-[11px] text-muted-foreground">{meta}</p>}
        </div>
      )}
      {trailing}
    </Tag>
  );
}

/** Compact separated list container for widget rows. */
export function WidgetList({
  children,
  className,
  divided = true,
}: {
  children: React.ReactNode;
  className?: string;
  divided?: boolean;
}) {
  return (
    <div className={cn(divided && "divide-y divide-border/60", className)}>{children}</div>
  );
}

/** WidgetMeta — timestamps and quiet supporting text. */
export function WidgetMeta({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-[11px] text-muted-foreground", className)}>{children}</p>;
}

/** WidgetStatus — status is never color-only: icon/dot + text label. */
export function WidgetStatus({
  tone = "neutral",
  children,
  className,
}: {
  tone?: SemanticTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        TONE_CHIP[tone],
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "neutral" ? "bg-muted-foreground" : "bg-current"
        )}
      />
      {children}
    </span>
  );
}

/** WidgetChart — consistent chart frame (height + margins) for every widget. */
export function WidgetChart({
  height = 140,
  children,
  className,
}: {
  height?: number;
  children: React.ReactElement;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** WidgetStatGrid — 2–4 subordinate stats under a primary value or header. */
export function WidgetStatGrid({
  items,
  columns,
  className,
}: {
  items: Array<{
    label: React.ReactNode;
    value: React.ReactNode;
    tone?: SemanticTone;
    helper?: React.ReactNode;
  }>;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = columns ?? (items.length >= 4 ? 4 : items.length === 3 ? 3 : 2);
  const colClass =
    cols === 4
      ? "grid-cols-2 @[26rem]:grid-cols-4"
      : cols === 3
        ? "grid-cols-1 @[20rem]:grid-cols-3"
        : "grid-cols-2";
  return (
    <div className={cn("grid gap-x-3 gap-y-2.5", colClass, className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
            {it.label}
          </p>
          <p
            className={cn(
              "truncate text-[15px] font-semibold tabular-nums leading-tight",
              TONE_TEXT[it.tone ?? "neutral"]
            )}
          >
            {it.value}
          </p>
          {it.helper && (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{it.helper}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** WidgetProgressRow — label + value on one line, quiet track beneath. */
export function WidgetProgressRow({
  label,
  value,
  percent,
  tone = "primary",
  leading,
  className,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  /** 0–100 */
  percent: number;
  tone?: SemanticTone;
  leading?: React.ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const bar: Record<SemanticTone, string> = {
    neutral: "bg-muted-foreground",
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  };
  return (
    <div className={cn("min-w-0 space-y-1.5 py-1.5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{label}</p>
        {value != null && (
          <p className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground">{value}</p>
        )}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", bar[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** WidgetSparkline — tiny inline trend strip built from plain divs (no chart lib cost). */
export function WidgetSparkline({
  values,
  tone = "primary",
  className,
}: {
  values: number[];
  tone?: SemanticTone;
  className?: string;
}) {
  if (!values.length) return null;
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  const bar: Record<SemanticTone, string> = {
    neutral: "bg-muted-foreground/40",
    primary: "bg-primary/60",
    success: "bg-success/60",
    warning: "bg-warning/60",
    destructive: "bg-destructive/60",
  };
  return (
    <div className={cn("flex h-8 items-end gap-[3px]", className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("min-w-[3px] flex-1 rounded-sm", bar[tone])}
          style={{ height: `${Math.max(6, (Math.abs(v) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * WidgetSectionLabel — quiet in-body grouping label (not shouty caps).
 * ------------------------------------------------------------------ */
export function WidgetSectionLabel({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-2", className)}>
      <p className="truncate text-[11px] font-medium text-muted-foreground">{children}</p>
      {trailing}
    </div>
  );
}

/** WidgetRankRow — ranked breakdown row where magnitude is read from a
 *  quiet bar sitting *behind* the label/value, not from a separate track.
 *  Best for category / gateway / department distributions. */
export function WidgetRankRow({
  label,
  value,
  percent,
  tone = "primary",
  leading,
  onClick,
  className,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  /** 0–100, relative to the largest item in the set */
  percent: number;
  tone?: SemanticTone;
  leading?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const fill: Record<SemanticTone, string> = {
    neutral: "bg-muted-foreground/12",
    primary: "bg-primary/12",
    success: "bg-success/12",
    warning: "bg-warning/14",
    destructive: "bg-destructive/12",
  };
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-[7px] text-left",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 rounded-md transition-[width] duration-300 motion-reduce:transition-none",
          fill[tone]
        )}
        style={{ width: `${pct}%` }}
      />
      {leading && <span className="relative z-10 shrink-0">{leading}</span>}
      <span className="relative z-10 min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
        {label}
      </span>
      {value != null && (
        <span className="relative z-10 shrink-0 text-[12.5px] font-semibold tabular-nums text-foreground">
          {value}
        </span>
      )}
    </Tag>
  );
}

/** WidgetKeyValueRow — dense two-column fact row (no plates, no cards). */
export function WidgetKeyValueRow({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: SemanticTone;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-baseline justify-between gap-3 py-[5px]", className)}>
      <span className="min-w-0 truncate text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("shrink-0 text-[12.5px] font-semibold tabular-nums", TONE_TEXT[tone])}>
        {value}
      </span>
    </div>
  );
}

/** WidgetKpiStrip — 2–4 headline figures in one compact band, hairline split. */
export function WidgetKpiStrip({
  items,
  className,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode; tone?: SemanticTone; helper?: React.ReactNode }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid divide-x divide-border/60",
        items.length >= 4 ? "grid-cols-2 @[24rem]:grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2",
        className
      )}
    >
      {items.map((it, i) => (
        <div key={i} className="min-w-0 px-3 py-2 first:pl-0 last:pr-0">
          <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">{it.label}</p>
          <p
            className={cn(
              "truncate text-[17px] font-semibold leading-tight tracking-tight tabular-nums",
              TONE_TEXT[it.tone ?? "neutral"]
            )}
          >
            {it.value}
          </p>
          {it.helper && (
            <p className="truncate text-[10.5px] leading-tight text-muted-foreground">{it.helper}</p>
          )}
        </div>
      ))}
    </div>
  );
}
