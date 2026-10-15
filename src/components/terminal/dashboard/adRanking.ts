/**
 * TD-FIX-B F1 — "Top sell ads" / "Top buy ads": each side ranked by rupee value
 * (remaining quantity `surplusAmount` × INR `price`), top N, ties by ad number.
 */
export type RankableAd = {
  advNo: string;
  tradeType: string;
  surplusAmount?: string | number | null;
  price?: string | number | null;
  fiatUnit?: string | null;
};

export type RankedAd<T extends RankableAd> = { ad: T; remaining: number; price: number; value: number };

const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** Rupee value of an ad, or null when it can't be valued in rupees (non-INR, missing, ≤ 0). */
export function adRupeeValue(ad: RankableAd): { remaining: number; price: number; value: number } | null {
  if (String(ad.fiatUnit ?? '').toUpperCase() !== 'INR') return null;
  const remaining = num(ad.surplusAmount);
  const price = num(ad.price);
  const value = remaining * price;
  if (!Number.isFinite(value) || value <= 0 || remaining <= 0 || price <= 0) return null;
  return { remaining, price, value };
}

function rankSide<T extends RankableAd>(ads: T[], side: 'BUY' | 'SELL', limit: number): RankedAd<T>[] {
  const out: RankedAd<T>[] = [];
  for (const ad of ads) {
    if (String(ad.tradeType).toUpperCase() !== side) continue;
    const v = adRupeeValue(ad);
    if (v) out.push({ ad, ...v });
  }
  out.sort((a, b) => b.value - a.value || String(a.ad.advNo).localeCompare(String(b.ad.advNo)));
  return out.slice(0, limit);
}

/** Pass ads that already passed the online + visibility filter. */
export function rankTopAdsByValue<T extends RankableAd>(ads: T[], limit = 3): { sell: RankedAd<T>[]; buy: RankedAd<T>[] } {
  return { sell: rankSide(ads, 'SELL', limit), buy: rankSide(ads, 'BUY', limit) };
}
