import { isSmallTradeOrder, type SmallTradeBands } from '@/lib/small-trade';

export interface SmallTradeThread {
  orderNumber: string;
  counterpartyNickname?: string | null;
  verifiedName?: string | null;
  tradeType?: string | null;
  totalPrice?: string | number | null;
  chatUnreadCount?: number | null;
  exchangeAccountId?: string | null;
}

export interface SmallTradeTarget {
  orderNumber: string;
  accountId?: string | null;
}

/**
 * Picks the unread chat threads that can be PROVEN to be small trades.
 *
 * Safety rules (identical for the manual button and the automation):
 * - Only real Binance orders (never `INQ-*` enquiry threads).
 * - Only orders whose side + amount fall inside the configured small bands.
 * - A counterparty holding ANY thread we cannot prove is small — read or
 *   unread — is protected entirely, so repeat big clients are never cleared.
 * - Optionally restricted to one side (`sidesAllowed`).
 */
export function selectSmallTradeTargets(
  threads: SmallTradeThread[],
  bands: SmallTradeBands | null | undefined,
  sidesAllowed: Array<'BUY' | 'SELL'> = ['BUY', 'SELL']
): SmallTradeTarget[] {
  if (!bands) return [];

  const aliasToVerified = new Map<string, string>();
  for (const c of threads) {
    const verified = (c.verifiedName || '').trim().toLowerCase();
    const nick = (c.counterpartyNickname || '').trim().toLowerCase();
    if (verified && nick && !nick.includes('*') && !aliasToVerified.has(nick)) {
      aliasToVerified.set(nick, verified);
    }
  }

  const identityKey = (c: SmallTradeThread) => {
    const verified = (c.verifiedName || '').trim().toLowerCase();
    const nick = (c.counterpartyNickname || '').trim().toLowerCase();
    const cleanNick = nick && !nick.includes('*') ? nick : '';
    const identifiable = verified || (cleanNick ? aliasToVerified.get(cleanNick) || cleanNick : '');
    return identifiable ? `${c.exchangeAccountId || 'all'}|${identifiable}` : `order|${c.orderNumber}`;
  };

  const protectedKeys = new Set<string>();
  for (const c of threads) {
    if (!isSmallTradeOrder(c, bands)) protectedKeys.add(identityKey(c));
  }

  const allowed = new Set(sidesAllowed);
  const seen = new Set<string>();
  const targets: SmallTradeTarget[] = [];
  for (const c of threads) {
    if ((c.chatUnreadCount || 0) <= 0) continue;
    if (!c.orderNumber || c.orderNumber.startsWith('INQ-')) continue;
    const side = String(c.tradeType || '').trim().toUpperCase();
    if (side !== 'BUY' && side !== 'SELL') continue;
    if (!allowed.has(side)) continue;
    if (!isSmallTradeOrder(c, bands)) continue;
    if (protectedKeys.has(identityKey(c))) continue;
    if (seen.has(c.orderNumber)) continue;
    seen.add(c.orderNumber);
    targets.push({ orderNumber: c.orderNumber, accountId: c.exchangeAccountId });
  }
  return targets;
}
