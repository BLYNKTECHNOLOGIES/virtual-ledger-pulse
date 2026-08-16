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
