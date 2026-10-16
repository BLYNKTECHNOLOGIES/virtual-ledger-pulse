/**
 * List helpers for the Sales and Purchase pages: one layout at a time (table or cards,
 * chosen by the panel's own width), row-click handlers, and the date filter.
 * Presentation only.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtDate } from "./format";

/**
 * Width of an element, measured before paint and kept up to date (0 until mounted).
 * Lists use it to mount exactly one layout (table or cards) for the space they really have.
 */
export function useElementWidth<T extends HTMLElement>() {
  // A callback ref, so the observer also attaches when the element mounts later (e.g. on a tab switch).
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const ref = useCallback((node: T | null) => setEl(node), []);
  return { ref, width };
}

/** True when the element is narrower than `px` (falls back to the window width before the first measure). */
export function useNarrow<T extends HTMLElement>(px = 640) {
  const { ref, width } = useElementWidth<T>();
  const w = width || (typeof window !== "undefined" ? window.innerWidth : 1280);
  return { ref, narrow: w < px, width: w };
}

const INTERACTIVE = "button, a, input, textarea, select, label, [role=checkbox], [role=switch], [data-no-row-click]";

/**
 * Click / Enter handlers for a list row that opens the order. Clicks on buttons, links and
 * inputs inside the row keep doing their own thing. preventDefault() also tells the shared
 * ClickableRow that the event is handled.
 */
export function rowOpenHandlers(open: () => void) {
  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      const hit = (e.target as HTMLElement).closest(INTERACTIVE);
      if (hit && hit !== e.currentTarget) return;
      if (window.getSelection?.()?.toString()) return; // selecting text, not opening
      e.preventDefault();
      open();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    },
  };
}

/**
 * Client-side paging (same shape as finance-ui usePaged) that keeps the user's page when rows are
 * added or removed — a delete, a refetch — and returns to page 1 only when `resetKey` changes
 * (search, filters). A page past the end is clamped.
 */
export function useListPages<T>(rows: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPage(0);
  }, [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(safe * pageSize, safe * pageSize + pageSize), [rows, safe, pageSize]);
  return { page: safe, pages, setPage, slice, total: rows.length, pageSize };
}

/** Table styling for order lists (own classes so cells never break mid-number). */
export const LIST_TABLE = cn(
  "w-full border-separate border-spacing-0 text-left text-[13px] [overflow-wrap:normal]",
  "[&_thead_th]:border-b [&_thead_th]:border-border [&_thead_th]:bg-muted/40 [&_thead_th]:px-3 [&_thead_th]:py-2 [&_thead_th]:text-[11px] [&_thead_th]:font-semibold [&_thead_th]:uppercase [&_thead_th]:tracking-[0.05em] [&_thead_th]:text-muted-foreground [&_thead_th]:whitespace-nowrap",
  "[&_tbody_td]:border-b [&_tbody_td]:border-border/60 [&_tbody_td]:px-3 [&_tbody_td]:align-middle [&_tbody_tr:last-child>td]:border-b-0",
  "[&_thead_th:first-child]:pl-4 [&_tbody_td:first-child]:pl-4 [&_thead_th:last-child]:pr-4 [&_tbody_td:last-child]:pr-4",
  "sm:[&_thead_th:first-child]:pl-5 sm:[&_tbody_td:first-child]:pl-5 sm:[&_thead_th:last-child]:pr-5 sm:[&_tbody_td:last-child]:pr-5",
);
export const LIST_DENSITY = { comfortable: "[&_tbody_td]:py-3", compact: "[&_tbody_td]:py-1.5" } as const;

/** "Any date" / "From 16 Oct 2026" / "Until 20 Oct 2026" / "16 Oct – 20 Oct 2026" / "28 Dec 2025 – 3 Jan 2026" */
export function dateRangeLabel(from?: Date, to?: Date) {
  if (from && to) {
    const sameYear = from.getFullYear() === to.getFullYear();
    return `${fmtDate(from, sameYear ? "d MMM" : "d MMM yyyy")} – ${fmtDate(to, "d MMM yyyy")}`;
  }
  if (from) return `From ${fmtDate(from)}`;
  if (to) return `Until ${fmtDate(to)}`;
  return "Any date";
}

/** One button that opens "From" and "To" calendars; either can be set alone. */
export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: {
  from?: Date;
  to?: Date;
  onFromChange: (d: Date | undefined) => void;
  onToChange: (d: Date | undefined) => void;
  className?: string;
}) {
  const active = !!from || !!to;
  const panelRef = useRef<HTMLDivElement>(null);
  // "Clear" disappears once used; keep the keyboard inside the open popover.
  const clear = (set: (d: Date | undefined) => void) => () => {
    set(undefined);
    panelRef.current?.focus();
  };
  const clearClass =
    "-my-2 -mr-1.5 inline-flex h-8 items-center rounded px-2 text-[11px] font-medium normal-case tracking-normal text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-9 justify-start gap-1.5 font-normal", active ? "text-foreground" : "text-muted-foreground", className)}
          aria-label={`Order date: ${dateRangeLabel(from, to)}`}
        >
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate">{dateRangeLabel(from, to)}</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
        {/* Phones stack the two calendars; the inner box scrolls within the space left under the
            trigger. (PopoverContent itself is role=dialog, which a global phone rule caps at 88vh.) */}
        <div
          ref={panelRef}
          tabIndex={-1}
          className="flex max-h-[calc(var(--radix-popover-content-available-height)-2px)] flex-col divide-y divide-border overflow-y-auto overscroll-contain outline-none sm:max-h-none sm:flex-row sm:divide-x sm:divide-y-0"
        >
          <div>
            <div className="flex min-h-[2.25rem] items-center justify-between px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              From
              {from && (
                <button type="button" className={clearClass} onClick={clear(onFromChange)} aria-label="Clear from date">
                  Clear
                </button>
              )}
            </div>
            <Calendar mode="single" selected={from} onSelect={onFromChange} defaultMonth={from} initialFocus />
          </div>
          <div>
            <div className="flex min-h-[2.25rem] items-center justify-between px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              To
              {to && (
                <button type="button" className={clearClass} onClick={clear(onToChange)} aria-label="Clear to date">
                  Clear
                </button>
              )}
            </div>
            <Calendar mode="single" selected={to} onSelect={onToChange} defaultMonth={to ?? from} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
