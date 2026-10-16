/**
 * Display helpers for the Sales and Purchase pages and their dialogs.
 * Presentation only: they never change or round the stored figures.
 */
import { format } from "date-fns";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";

export { inr, qty, count, pct } from "@/components/finance-ui/format";

/** A Date for anything date-like, or null when it can't be read (never throws). */
export function safeDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/** "16 Oct 2026" — or "—" for a missing or unreadable date. */
export function fmtDate(value: unknown, pattern = "d MMM yyyy"): string {
  const d = safeDate(value);
  if (!d) return "—";
  try {
    return format(d, pattern);
  } catch {
    return "—";
  }
}

/** "16 Oct 2026, 11:32" */
export const fmtDateTime = (value: unknown) => fmtDate(value, "d MMM yyyy, HH:mm");

/** "11:32" */
export const fmtTime = (value: unknown) => fmtDate(value, "HH:mm");

/** Groups the integer part with Indian separators and keeps the decimals as given. */
function groupInteger(text: string): string {
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  const [int, dec] = body.split(".");
  const grouped = Number(int).toLocaleString("en-IN");
  return `${neg ? "-" : ""}${grouped}${dec !== undefined ? "." + dec : ""}`;
}

/**
 * Asset quantity: "466.68", "1,174.15", "0.00134608" (at least 2, up to `maxDecimals`
 * significant decimals, trailing zeros removed).
 */
export function fmtQty(value: unknown, maxDecimals = 8): string {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(n)) return "—";
  return groupInteger(formatSmartDecimal(n, maxDecimals));
}

/** "466.68 USDT" */
export function fmtAssetQty(value: unknown, asset?: string | null, maxDecimals = 8): string {
  const q = fmtQty(value, maxDecimals);
  const code = String(asset || "").trim().toUpperCase();
  return q === "—" || !code ? q : `${q} ${code}`;
}

/** Unit price in rupees: ₹106.82, ₹67,02,385.00, and small prices keep their significant digits (₹0.0012). */
export function fmtRate(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs > 0 && abs < 1) return `${sign}₹${formatSmartDecimal(abs, 8)}`;
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Rupee amount: whole rupees without decimals, otherwise exactly 2 — ₹48,000 / ₹26,324.40. */
export function fmtInr(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(n)) return "—";
  // Same rounding as toLocaleString everywhere else; whole rupees drop the ".00".
  const text = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shown = text.endsWith(".00") ? text.slice(0, -3) : text;
  return `${n < 0 && shown !== "0" ? "-" : ""}₹${shown}`;
}

/** "Aarav" from a users embed (first name, else username), or null. */
export function personLabel(u?: { first_name?: string | null; username?: string | null } | null): string | null {
  if (!u) return null;
  return u.first_name || u.username || null;
}

/** "ABCD…7890" style shortening for long identifiers that already appear in full elsewhere. */
export function middleEllipsis(text: string, head = 6, tail = 6): string {
  const s = String(text || "");
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}
