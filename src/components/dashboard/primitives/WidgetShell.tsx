import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { AlertTriangle, MoreVertical, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ *
 * WidgetShell — the single container every dashboard widget lives in.
 * Presentation only. No data, no business logic.
 * ------------------------------------------------------------------ */

export type WidgetState = "ready" | "loading" | "empty" | "error";

interface WidgetShellProps {
  children: React.ReactNode;
  className?: string;
  /** Visually mark the tile as editable (customize mode). */
  isEditing?: boolean;
  /** Tile is currently being dragged. */
  isDragging?: boolean;
}

export function WidgetShell({ children, className, isEditing, isDragging }: WidgetShellProps) {
  return (
    <div
      className={cn(
        "group/widget @container relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
        "shadow-xs transition-[box-shadow,border-color,opacity] duration-200 ease-out motion-reduce:transition-none",
        !isEditing && "hover:shadow-sm",
        isEditing && "border-dashed border-primary/45 bg-card",
        isDragging && "opacity-60 shadow-md",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * WidgetHeader
 * ------------------------------------------------------------------ */

interface WidgetHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  /** Quiet-until-hover controls (filters, small toggles). */
  controls?: React.ReactNode;
  /** Always-visible leading node (e.g. a drag grip in edit mode). */
  leading?: React.ReactNode;
  /** Trailing node rendered after the controls (usually WidgetMenu). */
  actions?: React.ReactNode;
  className?: string;
}

export function WidgetHeader({
  title,
  subtitle,
  icon: Icon,
  controls,
  leading,
  actions,
  className,
}: WidgetHeaderProps) {
  return (
    <div
      className={cn(
        "flex min-h-10 shrink-0 items-center gap-2 border-b border-border px-3 py-2",
        className
      )}
    >
      {leading}
      {Icon && (
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{title}</p>
        {subtitle && (
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {controls && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 transition-opacity duration-150 motion-reduce:transition-none",
            "opacity-100 md:opacity-0 md:group-hover/widget:opacity-100 md:group-focus-within/widget:opacity-100"
          )}
        >
          {controls}
        </div>
      )}
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * WidgetBody
 * ------------------------------------------------------------------ */

export function WidgetBody({
  children,
  className,
  scroll = true,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1",
        padded && "p-3",
        scroll && "overflow-y-auto overflow-x-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

export function WidgetFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * WidgetMenu — one dropdown shape for every widget.
 * Items only render when the matching handler is supplied, so no
 * capability is invented for widgets that don't support it.
 * ------------------------------------------------------------------ */

export type WidgetSpanOption = { span: number; label: string };

export const WIDGET_SPAN_OPTIONS: WidgetSpanOption[] = [
  { span: 3, label: "Small — 1/4 width" },
  { span: 4, label: "Medium — 1/3 width" },
  { span: 6, label: "Large — 1/2 width" },
  { span: 12, label: "Full width" },
];

interface WidgetMenuProps {
  title?: string;
  onRefresh?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onResize?: (span: number) => void;
  currentSpan?: number;
  onRemove?: () => void;
  extraItems?: React.ReactNode;
}

export function WidgetMenu({
  title,
  onRefresh,
  onMoveUp,
  onMoveDown,
  onResize,
  currentSpan,
  onRemove,
  extraItems,
}: WidgetMenuProps) {
  const hasAny =
    onRefresh || onMoveUp || onMoveDown || onResize || onRemove || extraItems;
  if (!hasAny) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={title ? `${title} options` : "Widget options"}
          className={cn(
            "h-7 w-7 shrink-0 text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
            "opacity-100 md:opacity-0 md:group-hover/widget:opacity-100 md:group-focus-within/widget:opacity-100",
            "data-[state=open]:opacity-100"
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onRefresh && (
          <DropdownMenuItem onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </DropdownMenuItem>
        )}
        {(onMoveUp || onMoveDown) && (
          <>
            {onRefresh && <DropdownMenuSeparator />}
            {onMoveUp && <DropdownMenuItem onClick={onMoveUp}>Move up</DropdownMenuItem>}
            {onMoveDown && <DropdownMenuItem onClick={onMoveDown}>Move down</DropdownMenuItem>}
          </>
        )}
        {onResize && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Size
            </DropdownMenuLabel>
            {WIDGET_SPAN_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.span}
                onClick={() => onResize(opt.span)}
                className={cn(currentSpan === opt.span && "font-semibold text-primary")}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {extraItems}
        {onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onRemove}
              className="text-destructive focus:text-destructive"
            >
              Remove widget
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ *
 * States: skeleton / empty / error
 * ------------------------------------------------------------------ */

export type WidgetSkeletonVariant = "metric" | "chart" | "list" | "table";

export function WidgetSkeleton({
  variant = "list",
  rows = 4,
  className,
}: {
  variant?: WidgetSkeletonVariant;
  rows?: number;
  className?: string;
}) {
  if (variant === "metric") {
    return (
      <div className={cn("flex h-full flex-col justify-center gap-2 p-4", className)}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  if (variant === "chart") {
    return (
      <div className={cn("flex h-full flex-col gap-3 p-4", className)}>
        <Skeleton className="h-3 w-24" />
        <div className="flex flex-1 items-end gap-2" aria-hidden>
          {[45, 70, 35, 85, 55, 75, 40].map((h, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
          ))}
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 p-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-3 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function WidgetEmpty({
  icon,
  title = "Nothing to show",
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={cn("py-8", className)}
    />
  );
}

export function WidgetError({
  onRetry,
  message = "This widget couldn't load right now.",
}: {
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <p className="text-[13px] font-medium text-foreground">Couldn't load</p>
      <p className="max-w-[16rem] text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
