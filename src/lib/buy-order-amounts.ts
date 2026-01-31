import type { BuyOrder } from './buy-order-types';
import { calculatePayout } from './buy-order-types';
import { getEffectivePanType } from './buy-order-helpers';

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Returns the best-available gross order amount in INR.
 * Falls back to summing order items, then quantity*price_per_unit.
 */
export function getBuyOrderGrossAmount(order: Pick<BuyOrder, 'total_amount' | 'quantity' | 'price_per_unit' | 'purchase_order_items'>): number {
  const direct = safeNumber(order.total_amount);
  if (direct > 0) return direct;

  const items = (order.purchase_order_items || []) as any[];
  const fromItems = items.reduce((sum, item) => {
    const totalPrice = safeNumber(item?.total_price);
    if (totalPrice > 0) return sum + totalPrice;
    return sum + safeNumber(item?.quantity) * safeNumber(item?.unit_price);
  }, 0);
  if (fromItems > 0) return fromItems;

  // Common legacy case in this app: header quantity is set, item quantity is 0,
  // but unit_price exists on the first item.
  const headerQty = safeNumber(order.quantity);
  if (headerQty > 0 && items.length > 0) {
    const firstUnitPrice = safeNumber(items[0]?.unit_price);
    if (firstUnitPrice > 0) return headerQty * firstUnitPrice;
  }

  return safeNumber(order.quantity) * safeNumber(order.price_per_unit);
}

/**
 * Returns best-available net payable amount in INR (after TDS where applicable).
 */
export function getBuyOrderNetPayableAmount(order: BuyOrder): number {
  const storedNet = safeNumber(order.net_payable_amount);
  if (storedNet > 0) return storedNet;

  const gross = getBuyOrderGrossAmount(order);
  if (!order.tds_applied) return gross;

  const panType = getEffectivePanType(order);
  if (!panType) return gross;

  return calculatePayout(gross, panType).payout;
}
