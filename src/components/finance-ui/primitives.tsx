import { ReactNode, useEffect, useMemo, useState, KeyboardEvent, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { valueTypeScale } from "@/lib/formatCompactCurrency";
import { openTransaction, type TransactionType } from "@/components/transaction-detail";

/* ── Panel ─────────────────────────────────────────────────────────────── */

interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}

/** Card surface with a quiet header row — the one container used across the finance pages. */
export function Panel({ title, description, icon: Icon, actions, footer, children, className, bodyClassName, id }: PanelProps) {
  return (
    <section id={id} className={cn("min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-xs)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <h2 className="t-card-title text-foreground">{title}</h2>
            </div>
            {description && <p className="t-secondary mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">{footer}</footer>}
    </section>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

export function InfoTip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
            aria-label="More information"
            data-no-row-click
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Uppercase strip heading, e.g. "Right now" / "This period". */
export function StripHeading({ title, meta, className }: { title: string; meta?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className="t-label">{title}</span>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
    </div>
  );
}

export type DeltaSense = "up-good" | "up-bad" | "neutral";

/** Signed % change chip. Colour = direction × whether up is good. */
export function DeltaChip({ value, sense = "up-good", suffix, className }: { value: number | null | undefined; sense?: DeltaSense; suffix?: string; className?: string }) {
  if (value === null || value === undefined || !isFinite(value)) {
    return <span className={cn("text-[11px] font-medium text-muted-foreground", className)}>No earlier data</span>;
  }
  const up = value > 0;
  const flat = Math.abs(value) < 0.05;
  const good = sense === "neutral" ? null : sense === "up-good" ? up : !up;
  const tone = flat || good === null ? "text-muted-foreground bg-muted" : good ? "text-success bg-success/10" : "text-destructive bg-destructive/10";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", tone, className)}>
      {!flat && <Icon className="h-3 w-3" />}
      {up ? "+" : ""}
      {value.toFixed(1)}%{suffix ? <span className="ml-0.5 font-medium opacity-80">{suffix}</span> : null}
    </span>
  );
}

export type Tone = "default" | "positive" | "negative" | "primary" | "warning" | "muted";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-destructive",
  primary: "text-primary",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

/* ── KPI tile ──────────────────────────────────────────────────────────── */

interface KpiTileProps {
  label: string;
  value: string;
  /** Exact figure under the headline (also shown on hover). */
  exact?: string;
  sub?: ReactNode;
  delta?: ReactNode;
  info?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Route to open on click. */
  to?: string;
  searchParams?: Record<string, string | undefined>;
  onClick?: () => void;
  /** Short call to action shown on hover/focus for clickable tiles. */
  cta?: string;
  emphasis?: boolean;
  className?: string;
  loading?: boolean;
}

export function KpiTile({ label, value, exact, sub, delta, info, icon: Icon, tone = "default", to, searchParams, onClick, cta, emphasis, className, loading }: KpiTileProps) {
  const navigate = useNavigate();
  const clickable = !!to || !!onClick;
  const go = () => {
    if (onClick) return onClick();
    if (!to) return;
    const qs = new URLSearchParams();
    Object.entries(searchParams || {}).forEach(([k, v]) => { if (v) qs.append(k, v); });
    const q = qs.toString();
    navigate(q ? `${to}?${q}` : to);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? go : undefined}
      onKeyDown={onKey}
      className={cn(
        "group relative flex h-full min-w-0 flex-col rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-xs)]",
        clickable && "cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        emphasis && "bg-gradient-to-br from-card to-muted/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <span className="t-label min-w-0 break-words">{label}</span>
          {info && <InfoTip>{info}</InfoTip>}
        </div>
        {Icon && (
          <span className="shrink-0 rounded-md bg-muted p-1.5 text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-28 animate-pulse rounded bg-muted" />
      ) : (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className={cn("mt-1.5 w-fit font-display font-bold leading-tight tracking-tight", emphasis ? "text-[1.75rem] xl:text-[2rem]" : valueTypeScale(value), VALUE_TONE[tone])}>
                {value}
              </p>
            </TooltipTrigger>
            {exact && exact !== value && (
              <TooltipContent side="bottom"><span className="tabular-nums">{exact}</span></TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
      {exact && exact !== value && !loading && <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-muted-foreground">{exact}</p>}
      {(sub || delta) && !loading && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {delta}
          {sub && <span className="min-w-0">{sub}</span>}
        </div>
      )}
      {clickable && cta && (
        <span className="mt-auto flex items-center gap-1 pt-3 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          {cta}
          <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </div>
  );
}

/* ── Share bar (inline proportion) ─────────────────────────────────────── */

export function ShareBar({ value, max, tone = "primary", className, label }: { value: number; max: number; tone?: "primary" | "positive" | "negative" | "muted" | "warning"; className?: string; label?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (Math.abs(value) / max) * 100)) : 0;
  const fill = { primary: "bg-primary/70", positive: "bg-success/70", negative: "bg-destructive/70", muted: "bg-muted-foreground/40", warning: "bg-warning/70" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="img" aria-label={label ?? `${w.toFixed(0)}%`}>
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Two-column label/value line used inside statement-like panels. */
export function ValueRow({ label, value, hint, tone = "default", strong, className, info }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; strong?: boolean; className?: string; info?: ReactNode }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-2", className)}>
      <div className="min-w-0">
        <div className={cn("flex items-center gap-1.5 text-sm", strong ? "font-semibold text-foreground" : "text-foreground")}>
          <span className="min-w-0">{label}</span>
          {info && <InfoTip>{info}</InfoTip>}
        </div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className={cn("shrink-0 text-right font-mono tabular-nums", strong ? "text-[15px] font-semibold" : "text-[13px] font-medium", VALUE_TONE[tone])}>{value}</div>
    </div>
  );
}

/* ── Paging ────────────────────────────────────────────────────────────── */

export function usePaged<T>(rows: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey, rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(safe * pageSize, safe * pageSize + pageSize), [rows, safe, pageSize]);
  return { page: safe, pages, setPage, slice, total: rows.length, pageSize };
}

export function TablePager({ page, pages, total, pageSize, setPage, noun = "rows" }: { page: number; pages: number; total: number; pageSize: number; setPage: (p: number) => void; noun?: string }) {
  if (total <= pageSize) {
    return total > 0 ? <p className="px-1 pt-3 text-xs text-muted-foreground">{total.toLocaleString("en-IN")} {noun}</p> : null;
  }
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3">
      <p className="text-xs text-muted-foreground tabular-nums">
        {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} {noun}
      </p>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[4.5rem] text-center text-xs text-muted-foreground tabular-nums">
          Page {page + 1} of {pages}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Small "Updating…" pill shown while a new period loads over the previous figures. */
export function UpdatingPill({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground" role="status">
      <Loader2 className="h-3 w-3 animate-spin" /> Updating…
    </span>
  );
}

/** Status chip using the ERP's ds-status styles. */
export function StatusChip({ tone, children, className }: { tone: "success" | "warning" | "danger" | "info" | "neutral"; children: ReactNode; className?: string }) {
  return <span className={cn("ds-status", `ds-status-${tone}`, className)}>{children}</span>;
}

/** Legend key: a short coloured mark beside text-coloured label. */
export function LegendKey({ color, label, value, shape = "square" }: { color: string; label: ReactNode; value?: ReactNode; shape?: "square" | "line" }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn("shrink-0", shape === "line" ? "h-0.5 w-3 rounded-full" : "h-2.5 w-2.5 rounded-[3px]")}
        style={{ background: color }}
      />
      <span className="truncate">{label}</span>
      {value !== undefined && <span className="font-medium text-foreground tabular-nums">{value}</span>}
    </span>
  );
}

/**
 * Click / Enter handlers that open the shared transaction detail dialog for a
 * ClickableRow. They run before ClickableRow's own handler and mark the event
 * handled, so the row opens exactly once.
 */
export function rowOpenProps(type: TransactionType, id?: string | null) {
  if (!id) return {};
  return {
    onClick: (e: MouseEvent<HTMLTableRowElement>) => {
      const hit = (e.target as HTMLElement).closest("button, a, input, textarea, select, [data-no-row-click]");
      if (hit && hit !== e.currentTarget) return;
      e.preventDefault();
      openTransaction({ type, id });
    },
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openTransaction({ type, id });
      }
    },
  };
}
