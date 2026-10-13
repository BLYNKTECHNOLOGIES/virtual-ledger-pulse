import { ReactNode } from "react";
import { useThemeMode } from "@/contexts/ThemeContext";

/**
 * Chart palette for the finance pages. Categorical slots were checked with the
 * data-viz validator for both themes (lightness band, chroma, colour-blind and
 * normal-vision separation on every pair, 3:1 contrast): cyan → orange → blue.
 * Polarity (money in/out, profit/loss) uses the semantic success/destructive tokens
 * and is always backed by position (above/below the zero line).
 */
const LIGHT = { s1: "#00a0cc", s2: "#eb6834", s3: "#2a5bd7", muted: "#94a3b8" };
const DARK = { s1: "#0b9cc4", s2: "#d95926", s3: "#3a5fd0", muted: "#64748b" };

export function useChartPalette() {
  const { theme } = useThemeMode();
  const p = theme === "dark" ? DARK : LIGHT;
  return {
    ...p,
    positive: "hsl(var(--success))",
    negative: "hsl(var(--destructive))",
    primary: "hsl(var(--primary))",
    grid: "hsl(var(--border))",
    axis: "hsl(var(--muted-foreground))",
  };
}

/** Shared axis/grid props: hairline solid grid, quiet 11px ticks. */
export const axisProps = {
  tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  tickLine: false,
  axisLine: { stroke: "hsl(var(--border))" },
} as const;

export const gridProps = {
  stroke: "hsl(var(--border))",
  strokeOpacity: 0.7,
  vertical: false,
} as const;

interface TooltipRow {
  key: string;
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

/** Tooltip body: value first, series name second, keyed by a short line in the series colour. */
export function ChartTooltipBox({ title, rows, footer }: { title?: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-[160px] rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-[var(--shadow-md)]">
      {title && <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {r.color && <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="font-mono text-xs font-medium tabular-nums text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** Compact ₹ ticks for axes: ₹12L, ₹1.2Cr, ₹850K. */
export function axisInr(v: number): string {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_00_00_000) return `${s}₹${+(a / 1_00_00_000).toFixed(1)}Cr`;
  if (a >= 1_00_000) return `${s}₹${+(a / 1_00_000).toFixed(1)}L`;
  if (a >= 1_000) return `${s}₹${+(a / 1_000).toFixed(0)}K`;
  return `${s}₹${+a.toFixed(0)}`;
}
