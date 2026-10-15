// Shared presentation pieces for the Terminal Assets page.
import type { ReactNode } from "react";
import { COIN_COLORS } from "@/hooks/useBinanceAssets";
import { TONE_CHIP, statusTone } from "./assetFormat";

// Same segmented control as the Terminal Orders filters.
export const SEG_LIST = "h-8 min-h-0 flex-nowrap gap-0.5 rounded-md border border-border bg-secondary/60 p-0.5";
export const SEG_TRIGGER =
  "h-7 gap-1.5 rounded-[5px] px-2.5 py-0 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm";
/** Plain buttons styled like a segmented control (filters that are not Radix tabs). */
export const segBtn = (active: boolean) =>
  `inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
  }`;
// Lighter tint than the page-level control: these sit on a panel, and muted labels must stay readable in the light theme.
export const SEG_WRAP = "inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-secondary/30 p-0.5";
/** Count badge inside the panel filters. */
export const FILTER_COUNT = "t-mono min-w-[18px] rounded bg-muted px-1 text-center text-[10px] tabular-nums text-foreground";
/** Table header cell. */
export const TH = "h-9 px-3 text-left align-middle text-[10px] font-medium text-muted-foreground whitespace-nowrap";

const SIZES = { xs: "h-5 w-5 text-[7px]", sm: "h-7 w-7 text-[9px]", md: "h-8 w-8 text-[10px]", lg: "h-9 w-9 text-xs" } as const;

/** Decorative coin badge (the symbol is always printed next to it). */
export function CoinAvatar({ asset, size = "md" }: { asset: string; size?: keyof typeof SIZES }) {
  const color = COIN_COLORS[asset] || "hsl(var(--muted-foreground))";
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-1 ring-inset ring-white/15`}
      style={{ backgroundColor: color }}
    >
      {asset.slice(0, 2)}
    </span>
  );
}

/** Small status chip; tone follows the label unless given. */
export function StatusChip({ label, tone, title }: { label: string; tone?: keyof typeof TONE_CHIP; title?: string }) {
  const t = tone ?? statusTone(label);
  return (
    <span title={title} className={`inline-flex h-5 items-center whitespace-nowrap rounded px-1.5 text-[10px] font-medium ${TONE_CHIP[t]}`}>
      {label}
    </span>
  );
}

/** Buy / sell chip, same look as the Orders list. */
export function SideChip({ side }: { side: string }) {
  const buy = String(side).toUpperCase() === "BUY";
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 t-mono text-[10px] font-semibold uppercase tracking-wide ${
        buy ? "bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy" : "bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell"
      }`}
    >
      {buy ? "Buy" : "Sell"}
    </span>
  );
}

/** Centered empty / locked state inside a panel. */
export function PanelState({ icon, title, hint, tone = "muted" }: { icon: ReactNode; title: string; hint?: ReactNode; tone?: "muted" | "danger" }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
        {icon}
      </div>
      <p className={`text-sm font-medium ${tone === "danger" ? "text-destructive" : "text-foreground"}`}>{title}</p>
      {hint ? <div className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Shimmer rows while data loads. */
export function ShimmerRows({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="divide-y divide-border" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="t-shimmer h-8 w-8 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <div className="t-shimmer h-3 w-20 rounded" />
            <div className="t-shimmer h-2.5 w-14 rounded" />
          </div>
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <div className="t-shimmer h-3 w-24 rounded" />
            <div className="t-shimmer h-2.5 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
