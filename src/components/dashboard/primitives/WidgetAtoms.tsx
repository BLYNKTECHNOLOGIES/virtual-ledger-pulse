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
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                up ? "text-success" : "text-destructive"
              )}
            >
              <span aria-hidden>{up ? "▲" : "▼"}</span>
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
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            TONE_CHIP[iconTone]
          )}
        >
          <Icon className="h-4 w-4" />
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
          <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
