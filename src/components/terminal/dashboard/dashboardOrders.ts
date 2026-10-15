import type { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

/**
 * Cached order rows (from dbRowToOrder) → the orders the dashboard passes on.
 * Keeps the existing defaults, and keeps complaintStatus / hasActiveComplaint (TD-FIX-B F2).
 */
export function toDashboardOrder(o: any): C2COrderHistoryItem {
  return {
    orderNumber: o.orderNumber || '',
    advNo: o.advNo || '',
    tradeType: o.tradeType || '',
    asset: o.asset || 'USDT',
    fiatUnit: o.fiatUnit || 'INR',
    orderStatus: String(o.orderStatus || ''),
    amount: String(o.amount || '0'),
    totalPrice: String(o.totalPrice || '0'),
    unitPrice: String(o.unitPrice || '0'),
    commission: String(o.commission || '0'),
    counterPartNickName: o.counterPartNickName || '',
    createTime: o.createTime || 0,
    payMethodName: o.payMethodName,
    complaintStatus: o.complaintStatus ?? null,
    hasActiveComplaint: o.hasActiveComplaint === true,
  };
}

export function toDashboardOrders(rows: unknown): C2COrderHistoryItem[] {
  return Array.isArray(rows) ? rows.map(toDashboardOrder) : [];
}
