// Change detection for the Edit sales order / Edit purchase order dialogs. A completed order's
// ledger (bank, wallet, stock, TDS) is re-posted only when a field that feeds it really changed,
// so saving without changes moves no money and rewrites no amounts.

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/** A stored or typed amount as a number: blank is 0, thousands separators are ignored. */
export function toAmount(v: unknown): number {
  if (isBlank(v)) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Same stored value? null, undefined and "" are the same (no value); numbers compare as amounts
 * (so "62155.25" equals 62155.25), booleans compare as true/false (null is false).
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === "number" || typeof b === "number") return toAmount(a) === toAmount(b);
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return String(a ?? "") === String(b ?? "");
}

/** The entries of `next` whose value differs from the stored row: what an UPDATE should list. */
export function pickChanged<T extends Record<string, unknown>>(next: T, stored: object | null | undefined): Partial<T> {
  const saved = (stored ?? {}) as Record<string, unknown>;
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T & string)[]) {
    if (!sameValue(next[key], saved[key])) out[key] = next[key];
  }
  return out;
}

export interface AllocationRow {
  /** Bank account id (purchase) or payment method id (sales). */
  id: string | null | undefined;
  amount: unknown;
}

/** Same payment split rows (same ids with the same amounts), in any order. */
export function sameAllocation(a: AllocationRow[], b: AllocationRow[]): boolean {
  const keys = (rows: AllocationRow[]) => rows.map((r) => `${r.id ?? ""}|${toAmount(r.amount)}`).sort();
  const x = keys(a);
  const y = keys(b);
  return x.length === y.length && x.every((k, i) => k === y[i]);
}
