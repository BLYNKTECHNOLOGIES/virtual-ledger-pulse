// TA-FIX-1/3 — pure spot-trade rules shared by the binance-assets edge function and
// the Terminal Assets screen (an identical copy lives at
// src/components/terminal/assets/tradeRules.ts; a vitest test checks both agree).
// Exact decimal maths on scaled BigInts: no float rounding can push a figure up.

export interface SymbolRules {
  symbol: string;
  status: string; // "TRADING" when orders are accepted
  baseAsset: string;
  quoteAsset: string;
  stepSize: string; // effective step for MARKET quantity orders
  minQty: string;
  maxQty: string;
  minNotional: string;
  quotePrecision: number; // decimals allowed for quoteOrderQty
}

const SCALE = 8; // Binance asset precision

function pow10(n: number): bigint { return 10n ** BigInt(n); }

/** Decimal string/number → integer units at `dec` decimals, floored or ceiled. */
export function toUnits(v: number | string, dec = SCALE, mode: "floor" | "ceil" = "floor"): bigint {
  let s = typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(20) : "0") : String(v ?? "0").trim();
  if (!s || s === "-" || isNaN(Number(s))) return 0n;
  if (/e/i.test(s)) s = Number(s).toFixed(20);
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [ip, fp = ""] = s.split(".");
  const kept = (fp + "0".repeat(dec)).slice(0, dec);
  const rest = fp.slice(dec);
  let units = BigInt(ip || "0") * pow10(dec) + BigInt(kept || "0");
  const hasRest = /[1-9]/.test(rest);
  if (hasRest && ((mode === "ceil" && !neg) || (mode === "floor" && neg))) units += 1n;
  return neg ? -units : units;
}

export function fromUnits(u: bigint, dec = SCALE): string {
  const neg = u < 0n;
  const a = neg ? -u : u;
  const ip = a / pow10(dec);
  const fp = (a % pow10(dec)).toString().padStart(dec, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${ip}${fp ? "." + fp : ""}`;
}

export function decimalsOf(step: string): number {
  const fp = String(step).split(".")[1] || "";
  const trimmed = fp.replace(/0+$/, "");
  return trimmed.length;
}

/** Floor a quantity to a multiple of `step` (never up). */
export function floorToStep(qty: number | string, step: string): string {
  const q = toUnits(qty, SCALE, "floor");
  const st = toUnits(step, SCALE, "floor");
  if (st <= 0n) return fromUnits(q < 0n ? 0n : q);
  const floored = (q / st) * st;
  return fromUnits(floored < 0n ? 0n : floored);
}

/** Floor to `dec` decimals (never up). */
export function floorToDecimals(v: number | string, dec: number): string {
  return fromUnits(toUnits(v, dec, "floor"), dec);
}

/** Reduce exchangeInfo for one symbol to the rules a MARKET order needs. */
export function rulesFromExchangeInfo(s: any): SymbolRules {
  const f: Record<string, any> = {};
  for (const x of s?.filters || []) f[x.filterType] = x;
  const lot = f.LOT_SIZE || {};
  const mkt = f.MARKET_LOT_SIZE || {};
  const nonZero = (v: any) => toUnits(v ?? "0") > 0n;
  // MARKET orders must satisfy both LOT_SIZE and MARKET_LOT_SIZE (zero = not applied).
  const step = nonZero(mkt.stepSize) && toUnits(mkt.stepSize) > toUnits(lot.stepSize ?? "0") ? mkt.stepSize : lot.stepSize;
  const minQty = nonZero(mkt.minQty) && toUnits(mkt.minQty) > toUnits(lot.minQty ?? "0") ? mkt.minQty : lot.minQty;
  const maxQty = nonZero(mkt.maxQty) && (!nonZero(lot.maxQty) || toUnits(mkt.maxQty) < toUnits(lot.maxQty)) ? mkt.maxQty : lot.maxQty;
  const minNotional = (f.NOTIONAL?.applyMinToMarket !== false ? f.NOTIONAL?.minNotional : undefined)
    ?? (f.MIN_NOTIONAL?.applyToMarket !== false ? f.MIN_NOTIONAL?.minNotional : undefined) ?? "0";
  return {
    symbol: s.symbol,
    status: s.status,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    stepSize: fromUnits(toUnits(step ?? "0")),
    minQty: fromUnits(toUnits(minQty ?? "0")),
    maxQty: fromUnits(toUnits(maxQty ?? "0")),
    minNotional: fromUnits(toUnits(minNotional)),
    quotePrecision: Number(s.quoteAssetPrecision ?? s.quotePrecision ?? 8),
  };
}

export interface ShortfallResult {
  ok: boolean;
  move: string; // amount to move Funding → Spot ("0" when Spot already covers it)
  reason?: string;
}

/**
 * F1 — move only what Spot is missing: need − spotFree, rounded UP to 8 decimals,
 * never more than the free Funding balance. Rejects when Funding + Spot can't cover it.
 */
export function computeFundingShortfall(need: number | string, spotFree: number | string, fundingFree: number | string, asset = ""): ShortfallResult {
  const n = toUnits(need, SCALE, "ceil");
  const sp = toUnits(spotFree, SCALE, "floor");
  const fu = toUnits(fundingFree, SCALE, "floor");
  if (n <= 0n) return { ok: false, move: "0", reason: "Enter an amount greater than 0." };
  if (n > sp + fu) {
    return {
      ok: false, move: "0",
      reason: `Not enough ${asset}: the order needs ${fromUnits(n)} ${asset} but Funding (${fromUnits(fu)}) + Spot (${fromUnits(sp)}) hold only ${fromUnits(sp + fu)}. Nothing was moved.`.replace(/\s+\./g, "."),
    };
  }
  const short = n - sp;
  if (short <= 0n) return { ok: true, move: "0" };
  return { ok: true, move: fromUnits(short > fu ? fu : short) };
}

export interface OrderCheckInput {
  side: "BUY" | "SELL";
  amount: number | string; // BUY: quote to spend; SELL: base to sell
  available: number | string; // free Funding + Spot of the side's coin in the order's account
  price: number | string; // last price (for SELL notional)
  rules: SymbolRules;
  accountName?: string;
}

export interface OrderCheckResult {
  ok: boolean;
  message?: string;
  quantity?: string; // SELL: floored to step
  quoteOrderQty?: string; // BUY: floored to quote precision
}

/** F3 — the same pre-checks on screen and in the edge function. */
export function checkOrder(i: OrderCheckInput): OrderCheckResult {
  const r = i.rules;
  const pair = `${r.baseAsset}/${r.quoteAsset}`;
  if (r.status && r.status !== "TRADING") {
    return { ok: false, message: `${pair} is not trading on Binance right now (status ${r.status}).` };
  }
  const amt = toUnits(i.amount);
  if (amt <= 0n) return { ok: false, message: "Enter an amount greater than 0." };
  const coin = i.side === "BUY" ? r.quoteAsset : r.baseAsset;
  const avail = toUnits(i.available);
  if (amt > avail) {
    return {
      ok: false,
      message: `Not enough ${coin}: you entered ${fromUnits(amt)} but ${i.accountName ? i.accountName + " has" : "only"} ${fromUnits(avail)} ${coin} available (Funding + Spot).`,
    };
  }
  if (i.side === "SELL") {
    const qty = floorToStep(i.amount, r.stepSize);
    const q = toUnits(qty);
    if (q < toUnits(r.minQty) || q <= 0n) {
      return {
        ok: false,
        message: `Too small to sell: ${fromUnits(amt)} ${r.baseAsset} rounds down to ${qty} at Binance's step of ${r.stepSize}; the minimum is ${r.minQty} ${r.baseAsset}.`,
      };
    }
    if (toUnits(r.maxQty) > 0n && q > toUnits(r.maxQty)) {
      return { ok: false, message: `Too large for one market order: Binance allows at most ${r.maxQty} ${r.baseAsset} per order on ${pair}.` };
    }
    const notional = (q * toUnits(i.price)) / 10n ** 8n;
    if (toUnits(i.price) > 0n && notional < toUnits(r.minNotional)) {
      return { ok: false, message: `Order value ≈ ${fromUnits(notional)} ${r.quoteAsset} is below Binance's minimum of ${r.minNotional} ${r.quoteAsset} for ${pair}.` };
    }
    return { ok: true, quantity: qty };
  }
  const quote = floorToDecimals(i.amount, r.quotePrecision);
  if (toUnits(quote) < toUnits(r.minNotional)) {
    return { ok: false, message: `Order value ${quote} ${r.quoteAsset} is below Binance's minimum of ${r.minNotional} ${r.quoteAsset} for ${pair}.` };
  }
  return { ok: true, quoteOrderQty: quote };
}

/** F3/F9 — 25/50/75/100% and Max: always round DOWN (SELL to step, BUY to quote precision). */
export function percentOfAvailable(available: number | string, pct: number, side: "BUY" | "SELL", rules: SymbolRules | null): string {
  const part = (toUnits(available) * BigInt(Math.round(pct * 100))) / 10000n;
  const raw = fromUnits(part);
  if (!rules) return floorToDecimals(raw, side === "BUY" ? 2 : 8);
  return side === "SELL" ? floorToStep(raw, rules.stepSize) : floorToDecimals(raw, rules.quotePrecision);
}
