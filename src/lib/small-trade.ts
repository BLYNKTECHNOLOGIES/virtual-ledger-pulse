/**
 * Shared classification of "small trade" orders.
 *
 * The bands come straight from the small-order automation settings
 * (`small_sales_config` for SELL, `small_buys_config` for BUY), so the chat
 * inbox and the automation can never disagree on what counts as small.
 */

export interface SmallTradeBand {
  min: number;
  max: number;
}

export interface SmallTradeBands {
  sell: SmallTradeBand | null;
  buy: SmallTradeBand | null;
}

export interface SmallTradeCandidate {
  tradeType?: string | null;
  totalPrice?: string | number | null;
}

/**
 * True ONLY when the order can be proven small:
 * explicit BUY/SELL side, a finite positive total price, and a configured band
 * for that side which contains the price. Anything unknown returns false.
 */
export function isSmallTradeOrder(
  order: SmallTradeCandidate,
  bands: SmallTradeBands | null | undefined
): boolean {
  if (!bands) return false;
  const side = String(order.tradeType || '').trim().toUpperCase();
  if (side !== 'BUY' && side !== 'SELL') return false;

  const band = side === 'SELL' ? bands.sell : bands.buy;
  if (!band) return false;

  const price = typeof order.totalPrice === 'number' ? order.totalPrice : parseFloat(String(order.totalPrice ?? ''));
  if (!Number.isFinite(price) || price <= 0) return false;

  return price >= band.min && price <= band.max;
}

export function formatBandsLabel(bands: SmallTradeBands | null | undefined): string {
  if (!bands) return 'Small-order ranges not configured';
  const fmt = (b: SmallTradeBand | null, label: string) =>
    b ? `${label} ₹${b.min.toLocaleString('en-IN')}–₹${b.max.toLocaleString('en-IN')}` : null;
  const parts = [fmt(bands.sell, 'Sell'), fmt(bands.buy, 'Buy')].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Small-order ranges not configured';
}
