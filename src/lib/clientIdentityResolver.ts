import { supabase } from "@/integrations/supabase/client";

/**
 * ============================================================================
 * CLIENT IDENTITY RESOLUTION — Binance `userNo` ONLY.
 * ============================================================================
 *
 * Binance `userNo` (the stable, globally-unique numeric account id) is the
 * SINGLE source of truth for attributing an order to a client. Nickname- and
 * verified-KYC-name matching have been REMOVED entirely: KYC names are not
 * globally unique and display/nicknames collide across distinct accounts, so
 * both caused cross-contamination (one person's order welded onto an unrelated
 * client that merely shared a name/nickname).
 *
 * Nicknames and verified names are still STORED for display/audit only
 * (`client_binance_nicknames`, `client_verified_names`) but NOTHING matches on
 * them. The only helpers kept from the old system are the string sanitizers,
 * used purely to render clean display values.
 *
 * userNo is NOT present in the order-list payload — only in the order-detail.
 * It is captured into `cp_order_identity` at sync time (and by the background
 * cron as a safety net), and fetched ON DEMAND via the `resolve-order-userno`
 * edge function when still missing. We NEVER fabricate a userNo.
 */

/** Our own Binance handles — never treated as a counterparty identity. */
const OUR_HANDLES = new Set(["blynkex", "asec-corporation"]);

/**
 * Returns a clean, unmasked nickname (no '*'), trimmed and non-empty, or null.
 * Masked/'Unknown'/own-handle values are rejected. DISPLAY-ONLY — never used
 * for matching.
 */
export function sanitizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.includes('*')) return null;
  if (v.toLowerCase() === 'unknown') return null;
  if (OUR_HANDLES.has(v.toLowerCase())) return null;
  return v;
}

/**
 * Returns a clean verified KYC name, or null. DISPLAY-ONLY — never used for
 * matching.
 */
export function sanitizeVerifiedName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.includes('*')) return null;
  if (v.toLowerCase() === 'unknown') return null;
  return v;
}

/**
 * Extract the counterparty's `userNo` from a Binance getUserOrderDetail-shaped
 * payload. For SELL orders WE are the seller, so the counterparty is the buyer;
 * for BUY orders the counterparty is the seller. Returns null if absent.
 */
export function extractCounterpartyUserNo(detail: unknown, tradeType?: string | null): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = d[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return null;
  };
  if (String(tradeType || '').toUpperCase() === 'SELL') {
    return pick('buyerNo', 'buyerUserNo', 'buyerUserId');
  }
  return pick('sellerNo', 'sellerUserNo', 'sellerUserId');
}

export interface OrderUserNoResolution {
  cpUserNo: string | null;
  clientId: string | null;
  clientName: string | null;
  verifiedName: string | null;
  nickname: string | null;
  source: 'cache' | 'on_demand' | 'unavailable';
}

/**
 * userNo-first order → client resolution.
 *
 * 1. Cache: userNo already captured for this order in `cp_order_identity`.
 * 2. On-demand: fetch order-detail via `resolve-order-userno` to obtain userNo.
 *
 * Never fabricates a userNo; returns `source: 'unavailable'` when Binance does
 * not supply one.
 */
export async function resolveOrderUserNo(params: {
  orderNumber: string;
  tradeType?: string | null;
  exchangeAccountId?: string | null;
}): Promise<OrderUserNoResolution> {
  const { orderNumber, tradeType, exchangeAccountId } = params;
  const empty: OrderUserNoResolution = {
    cpUserNo: null, clientId: null, clientName: null, verifiedName: null, nickname: null, source: 'unavailable',
  };
  if (!orderNumber) return empty;

  // 1. Cache: userNo already captured for this order.
  const { data: cached } = await supabase
    .from('cp_order_identity')
    .select('cp_userno, verified_name, nickname')
    .eq('order_number', String(orderNumber))
    .maybeSingle();

  if (cached?.cp_userno) {
    const { data: resolved } = await supabase.rpc('resolve_client_by_userno', { p_cp_userno: String(cached.cp_userno) });
    const row = Array.isArray(resolved) ? resolved[0] : resolved;
    return {
      cpUserNo: String(cached.cp_userno),
      clientId: row?.client_id ?? null,
      clientName: row?.client_name ?? null,
      verifiedName: cached.verified_name ?? null,
      nickname: cached.nickname ?? null,
      source: 'cache',
    };
  }

  // 2. On-demand: fetch order-detail to obtain userNo.
  try {
    const { data, error } = await supabase.functions.invoke('resolve-order-userno', {
      body: { order_number: String(orderNumber), trade_type: tradeType ?? undefined, exchange_account_id: exchangeAccountId ?? undefined },
    });
    if (error || !data) return empty;
    if (!data.cp_userno) {
      return { ...empty, verifiedName: data.verified_name ?? null, nickname: data.nickname ?? null };
    }
    return {
      cpUserNo: String(data.cp_userno),
      clientId: data.client_id ?? null,
      clientName: data.client_name ?? null,
      verifiedName: data.verified_name ?? null,
      nickname: data.nickname ?? null,
      source: 'on_demand',
    };
  } catch {
    return empty;
  }
}

/**
 * Convenience alias: resolve the owning client for an order using userNo only.
 * Returns the client id (or null if the userNo is unknown / unmapped).
 */
export async function resolveOrderClient(params: {
  orderNumber: string;
  tradeType?: string | null;
  exchangeAccountId?: string | null;
}): Promise<OrderUserNoResolution> {
  return resolveOrderUserNo(params);
}

/**
 * Attach a resolved Binance userNo to a client (manual link at approval time or
 * enrichment). Best-effort; the DB unique constraint on `cp_userno` guarantees a
 * userNo can only ever belong to one client.
 */
export async function linkClientUserNo(clientId: string, cpUserNo: string | null | undefined, source = 'manual_link'): Promise<void> {
  const uno = cpUserNo != null ? String(cpUserNo).trim() : '';
  if (!clientId || !uno) return;
  try {
    await supabase.rpc('link_client_userno', { p_client_id: clientId, p_cp_userno: uno, p_source: source });
  } catch { /* best effort */ }
}
