// Shared presentation pieces for the Terminal Automation page.
// Presentation only: nothing here reads or writes data. Same look as the Terminal Orders and Assets pages.
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Segmented controls ───────────────────────────────────────────── */
/** Page-level segmented control (Radix TabsList + TabsTrigger). */
export const SEG_LIST = "h-8 min-h-0 flex-nowrap gap-0.5 rounded-md border border-border bg-secondary/60 p-0.5";
export const SEG_TRIGGER =
  "h-7 gap-1.5 rounded-[5px] px-2.5 py-0 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm [html.terminal-light_&]:text-foreground/80 [html.terminal-light_&]:hover:text-foreground [html.terminal-light_&]:data-[state=active]:text-foreground";
/** Lighter segmented wrapper for controls that sit on a panel (muted labels stay readable in the light theme). */
export const SEG_WRAP = "inline-flex h-8 max-w-full items-center gap-0.5 rounded-md border border-border bg-secondary/30 p-0.5";
/** Plain buttons styled like a segmented control; pair with aria-pressed. */
export const segBtn = (active: boolean) =>
  `inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground [html.terminal-light_&]:text-foreground/80 [html.terminal-light_&]:hover:text-foreground"
  }`;

/* ── Tables ───────────────────────────────────────────────────────── */
// The .terminal stylesheet already makes thead/tbody dense (10px uppercase heads, 12px cells, row borders).
/** Header cell. */
export const TH = "h-8 px-3 text-left align-middle whitespace-nowrap [html.terminal-light_&]:text-foreground/75";
/** Add to every <th> of a table inside a SCROLL_BOX so the header stays visible while rows scroll. */
export const TH_STICKY = "sticky top-0 z-10 [background:inherit]";
/** Body cell. */
export const TD = "px-3 align-middle";
/** Numbers, times, ids. */
export const NUM = "t-mono tabular-nums whitespace-nowrap";
/** Scroll box for long tables/logs: a real overflow container (not ScrollArea), so wheel, touch and keyboard all scroll.
 *  Cap the height only on wide panels, e.g. `${SCROLL_BOX} max-h-none @[52rem]:max-h-[28rem]`, and add tabIndex={0} + aria-label
 *  so keyboard users can scroll it. Vertical scroll chaining is contained only on wide panels: on phones the box doesn't scroll
 *  vertically, so the page must keep scrolling when a swipe starts on the table. */
export const SCROLL_BOX = "overflow-auto overscroll-x-contain @[52rem]:overscroll-y-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/* ── Text ─────────────────────────────────────────────────────────── */
/** Form label above a control. */
export const LABEL = "text-xs font-medium text-foreground";
/** Helper line under a control or a setting. */
export const HINT = "text-[11px] leading-4 text-muted-foreground";
/** Inline field error (pair the input with aria-invalid + aria-describedby). */
export const FIELD_ERROR = "text-[11px] leading-4 text-destructive";
/** Add to an Input/Textarea that has aria-invalid: a red ring while invalid (the Terminal's global control CSS owns the border colour). */
export const INVALID = "aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/70 aria-[invalid=true]:ring-offset-0";
/** Unit after a control ("min", "s", "%", "₹"). Put it NEXT TO a number input, never inside it: inside, a plain click can land
 *  on the browser's spin arrows and change the value. */
export const UNIT = "shrink-0 text-xs text-muted-foreground";
/** Radix Switch: in the light theme the default off track is grey on white (≈1.5:1); give it an edge that reaches 3:1 and a fill. */
export const SWITCH =
  "[html.terminal-light_&]:data-[state=unchecked]:border-[hsl(var(--muted-foreground)/0.8)] [html.terminal-light_&]:data-[state=unchecked]:bg-[hsl(var(--muted-foreground)/0.14)]";

/* ── Buttons ──────────────────────────────────────────────────────── */
/** Ghost icon button for row actions; always give it aria-label (and title for the mouse tooltip). */
export const ICON_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5";
export const ICON_BTN_DANGER =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5";

/* ── Delete confirmation (AlertDialog) ─────────────────────────────── */
// rounded-[12px], not rounded-xl: the global phone CSS pads `.rounded-xl[class*=shadow] > div:first-child`.
export const CONFIRM_CONTENT = "w-[calc(100%-2rem)] max-w-md gap-5 rounded-[12px] border-border bg-card p-5 sm:rounded-[12px]";
export const CONFIRM_HEADER = "space-y-1.5 text-left";
export const CONFIRM_TITLE = "text-base font-semibold leading-6";
export const CONFIRM_DESC = "break-words text-sm leading-5";
export const CONFIRM_FOOTER = "grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:space-x-0";
export const CONFIRM_CANCEL = "mt-0";
/** Add to buttonVariants({ variant: "destructive" }): in the dark theme white on the red fill is 4.05:1, so use the near-black
 *  label the Terminal's primary buttons use. */
export const CONFIRM_DELETE_DARK = "[html.terminal-dark_&]:text-[hsl(var(--primary-foreground))]";

/* ── Chips ────────────────────────────────────────────────────────── */
export type Tone = "success" | "danger" | "warning" | "info" | "primary" | "neutral" | "outline";
/** Tinted chip colours that pass contrast in both Terminal themes (trade-buy/sell tokens, not destructive/success). */
export const TONE_CHIP: Record<Tone, string> = {
  success: "bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy",
  danger: "bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info [html.terminal-light_&]:text-[hsl(213_82%_38%)]",
  primary: "bg-primary/10 text-primary",
  neutral: "bg-muted text-muted-foreground [html.terminal-light_&]:text-foreground/80",
  outline: "border border-border bg-transparent text-muted-foreground [html.terminal-light_&]:text-foreground/80",
};

type ChipProps = { tone?: Tone; mono?: boolean } & HTMLAttributes<HTMLSpanElement>;
/** Small status / category chip. Text is the information; colour only supports it. Forwards refs and props, so it can be
 *  a Tooltip/Popover trigger (asChild). */
export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip({ tone = "neutral", mono, className, children, ...rest }, ref) {
  return (
    <span
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[10px] font-medium [&_svg]:h-3 [&_svg]:w-3",
        mono && "t-mono tabular-nums",
        TONE_CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
});

/** Buy / sell chip with the same look as the Orders list. The text stays as given (e.g. "BUY"); pass mono={false} for
 *  words such as "Small Buy" so they don't read like code. */
export function SideChip({ side, children, mono = true }: { side: string; children?: ReactNode; mono?: boolean }) {
  const buy = String(side).toUpperCase().includes("BUY");
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-[10px] font-semibold ${mono ? "t-mono tracking-wide" : ""} ${
        buy ? "bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy" : "bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell"
      }`}
    >
      {children ?? side}
    </span>
  );
}

/* ── Panels ───────────────────────────────────────────────────────── */
/** Terminal panel. Children get container queries (@[44rem]: etc.) against the panel width. */
export function Panel({ children, className, labelledBy, label }: { children: ReactNode; className?: string; labelledBy?: string; label?: string }) {
  return (
    <section aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} className={cn("t-panel overflow-hidden @container", className)}>
      {children}
    </section>
  );
}

/** Head row for data panels (lists, logs): micro title, a count/meta, actions on the right. Wraps on narrow screens. */
export function PanelHead({ icon, title, titleId, meta, actions, className }: { icon?: ReactNode; title: ReactNode; titleId?: string; meta?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-1.5", className)}>
      {icon ? <span aria-hidden="true" className="text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> : null}
      <p role="heading" aria-level={2} id={titleId} className="t-panel-head-title">{title}</p>
      {meta != null ? <span className="t-mono text-[10px] tabular-nums text-muted-foreground">{meta}</span> : null}
      {actions ? <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

/** Head for settings panels: icon tile, sentence-case title, one-line description, optional control on the right. */
export function SectionHead({ icon, title, titleId, description, aside, className }: { icon?: ReactNode; title: ReactNode; titleId?: string; description?: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start gap-3 border-b border-border px-4 py-3", className)}>
      {icon ? (
        <div aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary [&_svg]:h-3.5 [&_svg]:w-3.5">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p role="heading" aria-level={2} id={titleId} className="text-sm font-semibold leading-5 text-foreground">{title}</p>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {aside ? (
        <div className={cn("flex shrink-0 basis-full flex-wrap items-center gap-2 @[30rem]:basis-auto", icon && "pl-10 @[30rem]:pl-0")}>{aside}</div>
      ) : null}
    </div>
  );
}

/** One setting: label + description on the left, the control on the right (stacked on phones).
 *  Pass htmlFor = the control's id so the label names it (a Radix Switch is a <button>, which <label for> names). */
export function SettingRow({ label, htmlFor, labelId, description, children, className }: { label: ReactNode; htmlFor?: string; labelId?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} id={labelId} className="text-sm font-medium text-foreground">{label}</label>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Label above a control, with an optional hint or error line under it. Keep `label` exactly the visible label text. */
export function Field({ label, htmlFor, hint, error, errorId, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; errorId?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={htmlFor} className={LABEL}>{label}</label>
      {children}
      {error ? <p id={errorId} className={FIELD_ERROR}>{error}</p> : hint ? <p className={HINT}>{hint}</p> : null}
    </div>
  );
}

/* ── States ───────────────────────────────────────────────────────── */
/** Centred empty / error / locked state inside a panel. */
export function PanelState({ icon, title, hint, tone = "muted", className }: { icon: ReactNode; title: string; hint?: ReactNode; tone?: "muted" | "danger"; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}>
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full [&_svg]:h-5 [&_svg]:w-5 ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
        {icon}
      </div>
      <p className={`text-sm font-medium ${tone === "danger" ? "text-destructive" : "text-foreground"}`}>{title}</p>
      {hint ? <div className="mt-1 max-w-md break-words text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Shimmer lines while a panel loads (announced once to screen readers). */
export function ShimmerRows({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="divide-y divide-border" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
          <div className="t-shimmer h-5 w-9 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="t-shimmer h-3 w-40 max-w-full rounded" />
            <div className="t-shimmer h-2.5 w-64 max-w-full rounded" />
          </div>
          <div className="t-shimmer hidden h-3 w-16 rounded sm:block" />
        </div>
      ))}
    </div>
  );
}

const NOTICE: Record<"warning" | "danger" | "info" | "success", { box: string; icon: ReactNode }> = {
  warning: { box: "border-warning/40 bg-warning/[0.06]", icon: <AlertTriangle className="text-warning" /> },
  danger: { box: "border-destructive/40 bg-destructive/[0.06]", icon: <XCircle className="text-destructive" /> },
  info: { box: "border-info/30 bg-info/[0.06]", icon: <Info className="text-info" /> },
  success: { box: "border-[hsl(var(--trade-buy,var(--success))/0.3)] bg-[hsl(var(--trade-buy,var(--success))/0.06)]", icon: <CheckCircle2 className="text-trade-buy" /> },
};

/** Inline banner inside a panel (e.g. "Couldn't load the saved settings"). Body text stays in foreground colours so it
 *  passes contrast on the tint; the colour sits in the border and icon. Only the danger tone is a live region (role=alert). */
export function InlineNotice({ tone = "info", title, children, className }: { tone?: "warning" | "danger" | "info" | "success"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const n = NOTICE[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5", n.box, className)}>
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{n.icon}</span>
      <div className="min-w-0 flex-1 break-words">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? <div className="text-foreground/80">{children}</div> : null}
      </div>
    </div>
  );
}

/** Small stat tile (counts, totals). */
export function Stat({ label, value, hint, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; className?: string }) {
  const valueTone = tone === "success" ? "text-trade-buy" : tone === "danger" ? "text-trade-sell" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : "text-foreground";
  return (
    <div className={cn("min-w-0 rounded-md border border-border bg-secondary/20 px-3 py-2", className)}>
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("t-mono text-lg font-semibold leading-7 tabular-nums", valueTone)}>{value}</p>
      {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
