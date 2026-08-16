/**
 * Shared chart theme for dashboard widgets.
 * Presentation only — never changes data, series keys or math.
 *
 * Colors resolve from the design-system CSS variables so charts stay in step
 * with light/dark themes instead of hardcoding hex values.
 */

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
}

/** Categorical series palette — semantic first, then neutral-leaning hues. */
export function chartSeriesColors(): string[] {
  return [
    cssVar("--primary", "hsl(217 91% 60%)"),
    cssVar("--success", "hsl(160 84% 39%)"),
    cssVar("--warning", "hsl(38 92% 50%)"),
    cssVar("--info", "hsl(199 89% 48%)"),
    cssVar("--destructive", "hsl(0 72% 51%)"),
    cssVar("--muted-foreground", "hsl(215 16% 47%)"),
  ];
}

export const chartColor = {
  primary: () => cssVar("--primary", "hsl(217 91% 60%)"),
  success: () => cssVar("--success", "hsl(160 84% 39%)"),
  warning: () => cssVar("--warning", "hsl(38 92% 50%)"),
  destructive: () => cssVar("--destructive", "hsl(0 72% 51%)"),
  muted: () => cssVar("--muted-foreground", "hsl(215 16% 47%)"),
  grid: () => cssVar("--border", "hsl(220 13% 91%)"),
};

/** Axis tick styling shared by every widget chart. */
export const axisTick = {
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
} as const;

export const axisProps = {
  tick: axisTick,
  tickLine: false,
  axisLine: false,
} as const;

/** Tooltip styled like the app's popovers instead of the recharts default. */
export const tooltipProps = {
  cursor: { fill: "hsl(var(--muted) / 0.5)" },
  contentStyle: {
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    boxShadow: "var(--shadow-md)",
    padding: "6px 10px",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", fontSize: 11, marginBottom: 2 },
  itemStyle: { color: "hsl(var(--popover-foreground))", fontSize: 12 },
} as const;

/** Faint horizontal-only gridlines. */
export const gridProps = {
  stroke: "hsl(var(--border))",
  strokeOpacity: 0.6,
  vertical: false,
} as const;
