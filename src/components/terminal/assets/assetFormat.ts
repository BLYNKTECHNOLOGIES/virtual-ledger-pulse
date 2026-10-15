// Display helpers for the Terminal Assets page (presentation only — never used for amounts that are sent anywhere).

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Coin quantity: thousands separators, up to `maxDp` decimals, no trailing zeros, never scientific notation. */
export function fmtQty(v: unknown, maxDp = 8): string {
  return toNum(v).toLocaleString("en-US", { maximumFractionDigits: maxDp });
}

/** Unit price: 4 decimals at or above 1, up to 8 below 1 (so 0.00001734 does not round to 0). */
export function fmtPrice(v: unknown): string {
  const n = toNum(v);
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 1 ? 4 : 8 });
}

/** Fixed two decimals with separators (USDT values, fiat). */
export function fmt2(v: unknown): string {
  const n = toNum(v);
  // rounding residue such as -0.0000001 must not print as "-0.00"
  return (Math.abs(n) < 0.005 ? 0 : n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** USDT estimate: two decimals; tiny non-zero values show as "< 0.01". */
export function fmtUsdt(v: number): string {
  if (v > 0 && v < 0.01) return "< 0.01";
  return fmt2(v);
}

const QUOTES = ["FDUSD", "USDT", "USDC", "TUSD", "BUSD", "EUR", "TRY", "BTC", "ETH", "BNB"];

/** "BTCUSDT" → { base: "BTC", quote: "USDT" }; unknown quotes keep the raw symbol as the base. */
export function splitPair(symbol: string | null | undefined): { base: string; quote: string } {
  const s = String(symbol || "");
  const q = QUOTES.find((x) => s.length > x.length && s.endsWith(x));
  return q ? { base: s.slice(0, -q.length), quote: q } : { base: s, quote: "" };
}

/** Upper-case status codes ("COMPLETED") read as words ("Completed"); mixed-case labels are kept. */
export function humanStatus(s: string | null | undefined): string {
  const v = String(s ?? "").trim();
  if (!v) return "—";
  if (v !== v.toUpperCase() || /\d/.test(v)) return v;
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Shortens a long hash for display: first 8 … last 6. */
export function shortHash(v: string, head = 8, tail = 6): string {
  return v.length > head + tail + 1 ? `${v.slice(0, head)}…${v.slice(-tail)}` : v;
}

/** Tone of a status label, shared by the trade log and the movement history. */
export function statusTone(s: string): "good" | "bad" | "wait" | "neutral" {
  const v = s.toLowerCase();
  if (["success", "completed", "confirmed", "credited", "filled"].includes(v)) return "good";
  if (["failed", "failure", "rejected", "cancelled", "canceled", "expired", "wrong deposit"].includes(v)) return "bad";
  if (["pending", "processing", "awaiting approval", "partial", "partially filled", "email sent", "waiting user confirm"].includes(v)) return "wait";
  return "neutral";
}

export const TONE_CHIP: Record<ReturnType<typeof statusTone>, string> = {
  good: "bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy",
  bad: "bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell",
  wait: "bg-warning/10 text-warning",
  neutral: "bg-muted text-muted-foreground",
};
