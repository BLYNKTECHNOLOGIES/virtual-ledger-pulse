/**
 * Layout pieces shared by the Sales and Purchase pages (lists, tabs, panels).
 * Presentation only: nothing here reads or writes data.
 */
import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type MutableRefObject, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/* ── Tabs ──────────────────────────────────────────────────────────────── */

/**
 * Underline tabs (ds-subnav). The extra classes cancel the boxed look of the shared
 * TabsList / TabsTrigger so only the bottom rule and the active underline remain.
 */
export const SUBNAV_LIST =
  "ds-subnav mb-4 flex h-auto min-h-0 w-full flex-nowrap justify-start gap-x-1 gap-y-0 overflow-x-auto rounded-none border-0 border-b border-border bg-transparent p-0";
export const SUBNAV_TRIGGER =
  "ds-subnav-item flex shrink-0 items-center gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-2.5 py-2 text-[13px] sm:px-3 [&>svg]:hidden sm:[&>svg]:block shadow-none hover:text-foreground data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

/** Count beside a tab label. `attention` marks waiting work. */
export function TabCount({ value, attention }: { value: number | null | undefined; attention?: boolean }) {
  if (value == null) return null;
  return (
    <span
      className={cn(
        "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums",
        attention ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      {value.toLocaleString("en-IN")}
    </span>
  );
}

/* ── Panels ────────────────────────────────────────────────────────────── */

/** Toolbar row inside a Panel (search, filters, view options). */
export function PanelToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 border-b border-border/70 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5", className)}>
      {children}
    </div>
  );
}

/** One quiet line under a toolbar: what the list shows. */
export function ListNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("px-3 pt-3 text-xs text-muted-foreground sm:px-5", className)}>{children}</p>;
}

/** Empty / no-results / error block used inside panels. */
export function PanelMessage({ icon: Icon, title, children, tone = "neutral", className }: { icon?: LucideIcon; title: string; children?: ReactNode; tone?: "neutral" | "danger"; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 px-4 py-12 text-center", className)} role={tone === "danger" ? "alert" : undefined}>
      {Icon && <Icon className={cn("mb-1 h-8 w-8", tone === "danger" ? "text-destructive/70" : "text-muted-foreground/50")} aria-hidden />}
      <p className={cn("text-sm font-medium", tone === "danger" ? "text-destructive" : "text-foreground")}>{title}</p>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PanelSkeleton({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2 p-3 sm:p-5" aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-md bg-foreground/[0.07]" />
      ))}
    </div>
  );
}

/* ── Inputs ────────────────────────────────────────────────────────────── */

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValueChange: (v: string) => void;
  label: string;
  containerClassName?: string;
};

/**
 * Search box with a leading icon and a clear button. Extra props (e.g. data-page-search) go to the input.
 * A plain text input (role=searchbox), not type="search": Escape must not clear the search, as before.
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onValueChange, label, containerClassName, className, placeholder, ...rest },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as MutableRefObject<HTMLInputElement | null>).current = el;
    },
    [ref],
  );
  return (
    <div className={cn("relative min-w-0", containerClassName)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={setRefs}
        type="text"
        role="searchbox"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          "flex h-9 w-full rounded-lg border border-input bg-surface-subtle py-1 pl-8 pr-9 text-sm text-foreground ring-offset-background transition-colors placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          className,
        )}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus(); // the button disappears; keep the keyboard in the box
          }}
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});

/**
 * Caps the height of a dropdown that opens under a field inside a dialog to the room left below the
 * field in the dialog body (at least 120px), so the list ends above the dialog footer instead of
 * running under it. It always opens below: a list that opened above, or a body that scrolled, could
 * slide rows under a resting pointer and open their hover previews (which load order history).
 * Re-measured while open when the body scrolls or resizes. Outside a dialog nothing changes.
 */
export function useDropdownFit(open: boolean, contentKey: unknown, preferred = 256) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!open || !anchor || !anchor.closest("[role=dialog]")) return;
    let clip = anchor.parentElement;
    while (clip && !/(auto|scroll|hidden)/.test(getComputedStyle(clip).overflowY)) clip = clip.parentElement;
    if (!clip) return;
    const box = clip;
    const measure = () => {
      const below = box.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom - 12;
      const room = Math.round(Math.max(120, Math.min(preferred, below)));
      setMaxHeight((h) => (h === room ? h : room));
    };
    measure();
    box.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      box.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [open, contentKey, preferred]);
  return { anchorRef, maxHeight };
}

/* ── Identifiers ───────────────────────────────────────────────────────── */

/** Order / reference number in the data font. `tail` > 0 emphasises the last digits operators compare. */
export function OrderNo({
  value,
  tail = 0,
  className,
  selectable = false,
}: {
  value?: string | number | null;
  tail?: number;
  className?: string;
  /** In clickable rows: clicks on the number don't open the row, so it can be selected and copied as before. */
  selectable?: boolean;
}) {
  const s = String(value ?? "").trim();
  if (!s) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const base = cn(
    "font-mono text-[12px] tabular-nums tracking-tight text-foreground",
    selectable && "w-fit max-w-full cursor-text",
    className,
  );
  const rowProps = selectable ? { "data-no-row-click": "" } : {};
  if (tail > 0 && s.length > tail + 2) {
    return (
      <span className={base} title={s} {...rowProps}>
        <span className="text-muted-foreground">{s.slice(0, -tail)}</span>
        <span className="font-semibold">{s.slice(-tail)}</span>
      </span>
    );
  }
  return (
    <span className={base} title={s} {...rowProps}>
      {s}
    </span>
  );
}

/** Small icon button that copies a value and confirms with a toast. */
export function CopyButton({ value, label = "Copy", className }: { value?: string | number | null; label?: string; className?: string }) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const text = String(value ?? "");
  if (!text) return null;
  return (
    <button
      type="button"
      data-no-row-click
      aria-label={`${label} ${text}`}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1200);
            toast({ title: "Copied", description: text });
          },
          () => toast({ title: "Couldn't copy", description: text, variant: "destructive" }),
        );
      }}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ── Read-only content blocks (lists and dialogs) ──────────────────────── */

/**
 * Small uppercase heading over a group, with optional actions on the right.
 * The size is !important because a global phone rule in index.css sets every h3 to 16px.
 */
export function Section({
  title,
  description,
  actions,
  icon: Icon,
  children,
  className,
  boxed,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  /** Wrap the content in a bordered box. */
  boxed?: boolean;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 space-y-2.5", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-1.5 !text-[11px] font-semibold uppercase !leading-4 tracking-[0.06em] text-muted-foreground">
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                {title}
              </h3>
            )}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(boxed && "rounded-lg border border-border bg-card p-3 sm:p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export type Fact = { label: ReactNode; value: ReactNode; mono?: boolean; span?: 1 | 2 | 3 | 4; hint?: ReactNode; className?: string };

/** Label-over-value grid for read-only record data. Falsy items are skipped. */
export function Facts({ items, cols = 2, className }: { items: Array<Fact | null | false | undefined>; cols?: 2 | 3 | 4; className?: string }) {
  const colClass = cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  const spanClass = (s?: number) => (s === 4 ? "sm:col-span-2 lg:col-span-4" : s === 3 ? "sm:col-span-3" : s === 2 ? "sm:col-span-2" : "");
  return (
    <dl className={cn("grid grid-cols-1 gap-x-5 gap-y-3", colClass, className)}>
      {items.filter(Boolean).map((it, i) => {
        const f = it as Fact;
        return (
          <div key={i} className={cn("min-w-0", spanClass(f.span), f.className)}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{f.label}</dt>
            <dd className={cn("mt-0.5 break-words text-[13px] font-medium leading-5 text-foreground", f.mono && "font-mono text-[12px] tabular-nums")}>{f.value}</dd>
            {f.hint && <dd className="mt-0.5 text-[11px] text-muted-foreground">{f.hint}</dd>}
          </div>
        );
      })}
    </dl>
  );
}

const CALLOUT_TONE = {
  info: "border-primary/30 bg-primary/5 [&_.callout-icon]:text-primary",
  success: "border-success/30 bg-success/5 [&_.callout-icon]:text-success",
  warning: "border-warning/40 bg-warning/10 [&_.callout-icon]:text-warning",
  danger: "border-destructive/30 bg-destructive/5 [&_.callout-icon]:text-destructive",
  neutral: "border-border bg-muted/40 [&_.callout-icon]:text-muted-foreground",
} as const;

/** Inline notice: a short sentence with a coloured icon; text stays in body colour for contrast. */
export function Callout({
  tone = "info",
  icon: Icon = AlertTriangle,
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONE;
  icon?: LucideIcon | null;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-5 text-foreground", CALLOUT_TONE[tone], className)}>
      {Icon && <Icon className="callout-icon mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-foreground/85")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Money breakdown line: label left, figure right (tabular). */
export function SummaryRow({
  label,
  value,
  hint,
  tone = "default",
  strong,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning" | "muted";
  strong?: boolean;
  className?: string;
}) {
  const toneClass = { default: "text-foreground", positive: "text-success", negative: "text-destructive", warning: "text-warning", muted: "text-muted-foreground" }[tone];
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", strong && "mt-1 border-t border-border pt-2.5", className)}>
      <div className="min-w-0">
        <div className={cn("text-[13px]", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className={cn("shrink-0 text-right font-mono tabular-nums", strong ? "text-[14px] font-semibold" : "text-[13px] font-medium", toneClass)}>{value}</div>
    </div>
  );
}

/** A setting row: title and explanation on the left, a control (e.g. Switch) on the right. */
export function ToggleRow({ title, description, control, children, className }: { title: ReactNode; description?: ReactNode; control: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-3 py-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">{title}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}
