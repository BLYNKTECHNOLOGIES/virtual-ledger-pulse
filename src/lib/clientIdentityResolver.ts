import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a clean, unmasked nickname (no '*'), trimmed and non-empty,
 * or null. Masked values from the Binance public chat must NEVER be
 * persisted, looked up by, or used as identity — they reveal nothing
 * about the actual counterparty and cause cross-contamination.
 *
 * NOTE: "P2P-xxxxxxxx", "User-1234" and phone-style all-digit strings are
 * Binance's default handles for counterparties who never set a custom
 * nickname. Contrary to an earlier assumption, database analysis proved
 * these are a PERFECT 1:1 bijection with userNo (3,844 distinct P2P handles,
 * zero collisions in either direction) — i.e. the MOST stable identifiers we
 * have, and the only identity string for ~19% of order flow. They never
 * caused a merge (shared *custom names* did). They are therefore accepted as
 * valid identity for both lookup and persistence. Only masked/'Unknown'/empty
 * strings are rejected here.
 */
export function sanitizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.includes('*')) return null;
  if (v.toLowerCase() === 'unknown') return null;
  return v;
}

/**
 * Returns a clean verified KYC name, or null. Same sentinel rules as
 * sanitizeNickname — never accept 'Unknown' or masked strings as identity.
 */
export function sanitizeVerifiedName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.includes('*')) return null;
  if (v.toLowerCase() === 'unknown') return null;
  return v;
}

/**
 * Multi-signal client identity resolution.
 * 
 * Resolution hierarchy:
 * Priority 0: client_verified_names (immutable KYC name — gold standard)
 * Priority 1: client_binance_nicknames (unmasked nickname)
 * Priority 2: Intersection — if verified name returned multiple candidates, use nickname to disambiguate
 * Priority 3: Case-insensitive name match against clients table
 */

export interface ResolvedClient {
  clientId: string | null;
  resolvedVia: 'verified_name' | 'nickname' | 'intersection' | 'name_match' | null;
}

/**
 * userNo-first order → client resolution.
 *
 * Binance `userNo` (the stable, unique account id) is the PRIMARY identity
 * anchor. It is NOT present in the order-list payload — only in order-detail —
 * so it is captured into `cp_order_identity` by the background cron. When it is
 * not yet known for a fresh order we fetch the order-detail ON DEMAND via the
 * `resolve-order-userno` edge function. We NEVER fabricate a userNo.
 *
 * Returns the resolved userNo (if obtainable) and the owning client (if the
 * userNo is already mapped in `client_binance_usernos`).
 */
export interface OrderUserNoResolution {
  cpUserNo: string | null;
  clientId: string | null;
  clientName: string | null;
  verifiedName: string | null;
  nickname: string | null;
  source: 'cache' | 'on_demand' | 'unavailable';
}

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
 * Batch-fetch verified name → client_id mappings for a list of verified names.
 * Returns a Map<verified_name, client_id[]> (may have multiple clients per name).
 */
export async function fetchVerifiedNameMap(
  verifiedNames: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (verifiedNames.length === 0) return map;

  const { data } = await supabase
    .from('client_verified_names')
    .select('verified_name, client_id')
    .in('verified_name', verifiedNames);

  for (const row of data || []) {
    const existing = map.get(row.verified_name) || [];
    if (!existing.includes(row.client_id)) existing.push(row.client_id);
    map.set(row.verified_name, existing);
  }
  return map;
}

/**
 * Resolve a single order to a client using multi-signal identity resolution.
 */
export function resolveClientId(params: {
  verifiedName: string | null;
  unmaskedNickname: string | null;
  safeNickname: string | null;
  counterpartyName: string;
  verifiedNameMap: Map<string, string[]>;
  nicknameClientMap: Map<string, string>;
  clientNameMap: Map<string, string>;
}): ResolvedClient {
  const { verifiedName, unmaskedNickname, safeNickname, counterpartyName, verifiedNameMap, nicknameClientMap, clientNameMap } = params;

  // Priority 0: Verified name lookup
  if (verifiedName) {
    const candidates = verifiedNameMap.get(verifiedName) || [];
    if (candidates.length === 1) {
      return { clientId: candidates[0], resolvedVia: 'verified_name' };
    }
    // Multiple candidates — try intersection with nickname (Priority 2)
    if (candidates.length > 1) {
      const nickClientId = (unmaskedNickname ? nicknameClientMap.get(unmaskedNickname) : null)
        || (safeNickname ? nicknameClientMap.get(safeNickname) : null);
      if (nickClientId && candidates.includes(nickClientId)) {
        return { clientId: nickClientId, resolvedVia: 'intersection' };
      }
    }
  }

  // Priority 1: Nickname lookup
  if (unmaskedNickname) {
    const id = nicknameClientMap.get(unmaskedNickname);
    if (id) return { clientId: id, resolvedVia: 'nickname' };
  }
  if (safeNickname) {
    const id = nicknameClientMap.get(safeNickname);
    if (id) return { clientId: id, resolvedVia: 'nickname' };
  }

  // Priority 3: Name-based match — DISABLED for auto-linking.
  // A shared display name is NOT a reliable identity signal: distinct Binance
  // users routinely share the same name, and auto-linking on it is the root
  // cause of merged client records. Returning null forces the row into the
  // manual client-mapping queue where an operator confirms identity.
  return { clientId: null, resolvedVia: null };
}

/**
 * 4-state identity classification for an onboarding approval row.
 *
 *   linked_known        — Binance nickname is already linked to an existing client (highest trust).
 *   verified_name_match — KYC verified name matches an existing client; nickname not yet linked.
 *   name_collision      — A client with the same display name exists, but neither nickname nor
 *                         verified name match → almost certainly a different person.
 *   new_client          — No match on any signal.
 */
export type ApprovalIdentityState =
  | 'linked_known'
  | 'verified_name_match'
  | 'name_collision'
  | 'new_client';

export interface ApprovalIdentityMatch {
  state: ApprovalIdentityState;
  matchedClient?: {
    id: string;
    name: string;
    client_id?: string | null;
    risk_appetite?: string | null;
    buyer_approval_status?: string | null;
    seller_approval_status?: string | null;
  };
}

export function resolveApprovalIdentityState(params: {
  displayName: string;
  binanceNickname: string | null;
  verifiedName: string | null;
  nicknameToClient: Map<string, { id: string; name: string; client_id?: string | null; risk_appetite?: string | null; buyer_approval_status?: string | null; seller_approval_status?: string | null }>;
  verifiedNameToClient: Map<string, { id: string; name: string; client_id?: string | null; risk_appetite?: string | null; buyer_approval_status?: string | null; seller_approval_status?: string | null }>;
  displayNameToClient: Map<string, { id: string; name: string; client_id?: string | null; risk_appetite?: string | null; buyer_approval_status?: string | null; seller_approval_status?: string | null }>;
}): ApprovalIdentityMatch {
  const { displayName, binanceNickname, verifiedName, nicknameToClient, verifiedNameToClient, displayNameToClient } = params;

  // Priority 1 — nickname link (skip masked)
  const nick = binanceNickname?.trim();
  if (nick && !nick.includes('*')) {
    const c = nicknameToClient.get(nick);
    if (c) return { state: 'linked_known', matchedClient: c };
  }

  // Priority 2 — verified-name link (KYC trust)
  const vname = verifiedName?.trim();
  if (vname) {
    const c = verifiedNameToClient.get(vname);
    if (c) return { state: 'verified_name_match', matchedClient: c };
  }

  // Priority 3 — name collision: a client with same display name but no
  // nickname/verified-name correlation → almost certainly a different person.
  const dname = displayName?.trim().toLowerCase();
  if (dname) {
    const c = displayNameToClient.get(dname);
    if (c) return { state: 'name_collision', matchedClient: c };
  }

  return { state: 'new_client' };
}

/**
 * Resolve a terminal sync row to a client using the strict precedence:
 *   1. Binance nickname link  (`client_binance_nicknames`, is_active)
 *   2. Verified-name link     (`client_verified_names`)
 *   3. Single exact name match (`clients.name` case-insensitive, non-deleted, non-rejected)
 *   4. Multiple/ambiguous     → return null + candidates (UI must force manual pick)
 *
 * Returns also a `crossNameWarning` flag set when the auto-linked client's name
 * differs from the displayed name on Binance — the operator should confirm.
 */
export type TerminalAutoMatchVia = 'nickname' | 'verified_name' | 'name_exact' | null;
export interface TerminalAutoMatchResult {
  clientId: string | null;
  clientName: string | null;
  resolvedVia: TerminalAutoMatchVia;
  crossNameWarning: boolean;
  ambiguousCandidates: { id: string; name: string }[];
  /**
   * Non-binding suggestion produced by an exact display-name match. Name
   * matching is UNRELIABLE (distinct Binance users routinely share a name),
   * so it is NEVER auto-linked — the operator must confirm it explicitly.
   */
  nameSuggestion: { id: string; name: string } | null;
}

export async function resolveTerminalApprovalClient(params: {
  unmaskedNickname: string | null;
  verifiedName: string | null;
  displayName: string | null;
  /** 'buyer' for sales orders (counterparty is buyer), 'seller' for purchase orders */
  side: 'buyer' | 'seller';
}): Promise<TerminalAutoMatchResult> {
  const { unmaskedNickname, verifiedName, displayName, side } = params;
  const empty: TerminalAutoMatchResult = {
    clientId: null, clientName: null, resolvedVia: null,
    crossNameWarning: false, ambiguousCandidates: [], nameSuggestion: null,
  };
  const isRejected = (c: { buyer_approval_status: string | null; seller_approval_status: string | null }) =>
    side === 'buyer' ? c.buyer_approval_status === 'REJECTED' : c.seller_approval_status === 'REJECTED';

  // 1) Nickname
  const nick = unmaskedNickname?.trim();
  if (nick && !nick.includes('*')) {
    const { data: link } = await supabase
      .from('client_binance_nicknames')
      .select('client_id')
      .eq('nickname', nick)
      .eq('is_active', true)
      .maybeSingle();
    if (link?.client_id) {
      const { data: c } = await supabase
        .from('clients')
        .select('id, name, is_deleted, buyer_approval_status, seller_approval_status')
        .eq('id', link.client_id)
        .maybeSingle();
      if (c && !c.is_deleted && !isRejected(c)) {
        const cross = !!(displayName && c.name.trim().toLowerCase() !== displayName.trim().toLowerCase());
        return { clientId: c.id, clientName: c.name, resolvedVia: 'nickname', crossNameWarning: cross, ambiguousCandidates: [], nameSuggestion: null };
      }
    }
  }

  // 2) Verified name
  const vname = verifiedName?.trim();
  if (vname) {
    const { data: rows } = await supabase
      .from('client_verified_names')
      .select('client_id')
      .eq('verified_name', vname);
    const ids = Array.from(new Set((rows || []).map(r => r.client_id)));
    if (ids.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, is_deleted, buyer_approval_status, seller_approval_status')
        .in('id', ids);
      const valid = (clients || []).filter(c => !c.is_deleted && !isRejected(c));
      if (valid.length === 1) {
        // Do NOT auto-link on a verified-name match alone. Per project rule,
        // KYC verified names are IMMUTABLE per client but NOT globally unique —
        // two distinct Binance accounts (different userNo) can legitimately
        // share the same KYC name (e.g. "ABHISHEK SINGH"). Auto-linking on a
        // single verified-name match is the root cause of cross-contamination:
        // a brand-new person's order gets attributed to an unrelated existing
        // client that merely shares the name. Only Binance userNo (handled in
        // the caller, before this fn) is a high-confidence auto-lock. Surface
        // the verified-name hit as a suggestion the operator must confirm.
        const c = valid[0];
        return { ...empty, nameSuggestion: { id: c.id, name: c.name } };
      }
      if (valid.length > 1) {
        return { ...empty, ambiguousCandidates: valid.map(c => ({ id: c.id, name: c.name })) };
      }

    }
  }

  // 3) Single exact name
  const dname = displayName?.trim().toLowerCase();
  if (dname) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, is_deleted, buyer_approval_status, seller_approval_status')
      .ilike('name', displayName!.trim());
    const exact = (clients || []).filter(c =>
      !c.is_deleted && !isRejected(c) && c.name.trim().toLowerCase() === dname
    );
    if (exact.length === 1) {
      // Do NOT auto-link on a name match — it is unreliable (distinct Binance
      // users frequently share a display name). Surface it as a suggestion the
      // operator must confirm before it becomes a binding client link.
      return { ...empty, nameSuggestion: { id: exact[0].id, name: exact[0].name } };
    }
    if (exact.length > 1) {
      return { ...empty, ambiguousCandidates: exact.map(c => ({ id: c.id, name: c.name })) };
    }
  }

  return empty;
}

/**
 * Auto-upsert verified name into client_verified_names for progressive enrichment.
 * Best-effort — errors are silently ignored.
 */
export async function captureVerifiedName(
  clientId: string,
  verifiedName: string | null,
  source: string = 'auto_sync'
): Promise<void> {
  if (!verifiedName || verifiedName === 'Unknown') return;
  try {
    await supabase.from('client_verified_names').upsert(
      {
        client_id: clientId,
        verified_name: verifiedName,
        source,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,verified_name' }
    );
  } catch { /* best effort */ }
}

/**
 * Progressive enrichment: when an order recurs for a Binance nickname (proxy for the
 * stable userNo) that is already linked to a client, backfill the real KYC verified
 * name onto that client's directory record if it isn't already stored.
 *
 * This is what lets a split same-name client (e.g. one of the de-merged "MANOJ KUMAR"
 * records) acquire its correct verified name the next time one of its orders is synced,
 * without ever touching a different client that happens to share the display name.
 *
 * Safe by construction: the nickname is already linked to the target client, so the
 * server-side attachment trigger (order-backed condition) is satisfied. Best-effort.
 */
export async function enrichVerifiedNameByNickname(
  nickname: string | null | undefined,
  verifiedName: string | null | undefined,
  source: string = 'order_reappear'
): Promise<void> {
  const nick = sanitizeNickname(nickname);
  const verified = sanitizeVerifiedName(verifiedName);
  if (!nick || !verified) return;
  try {
    const { data: link } = await supabase
      .from('client_binance_nicknames')
      .select('client_id')
      .eq('nickname', nick)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!link?.client_id) return;

    // Skip if this exact verified name is already attached (avoid redundant writes).
    const { data: existing } = await supabase
      .from('client_verified_names')
      .select('id')
      .eq('client_id', link.client_id)
      .ilike('verified_name', verified)
      .maybeSingle();
    if (existing) return;

    await captureVerifiedName(link.client_id, verified, source);
  } catch { /* best effort */ }
}

/**
 * Correlation check: returns true if it is SAFE to attach `verifiedName` to
 * `clientId`. Used by all "merge into existing client" approval flows to
 * prevent cross-contamination of the KYC verified-name table.
 *
 * Safe when ANY of:
 *   (a) verifiedName matches the client's stored name (case-insensitive)
 *   (b) the same (client_id, verified_name) is already attached
 *   (c) `supportingNickname` (the nickname being linked in the same flow)
 *       is already in client_binance_nicknames for this client, AND there
 *       is at least one binance_order_history row tying that nickname to
 *       this verified_name.
 *
 * The DB trigger `trg_validate_verified_name_attachment` enforces the same
 * rule server-side; this helper lets the UI skip the upsert silently
 * instead of showing a confusing error.
 */
export async function canAttachVerifiedName(params: {
  clientId: string;
  verifiedName: string;
  supportingNickname?: string | null;
}): Promise<boolean> {
  const verified = sanitizeVerifiedName(params.verifiedName);
  if (!verified) return false;

  // (a) client name match
  const { data: c } = await supabase
    .from('clients')
    .select('name')
    .eq('id', params.clientId)
    .maybeSingle();
  if (c?.name && c.name.trim().toLowerCase() === verified.toLowerCase()) return true;

  // (b) already attached
  const { data: existing } = await supabase
    .from('client_verified_names')
    .select('id')
    .eq('client_id', params.clientId)
    .ilike('verified_name', verified)
    .maybeSingle();
  if (existing) return true;

  // (c) order-backed via supporting nickname (or any nickname linked to this client)
  const { data: nicks } = await supabase
    .from('client_binance_nicknames')
    .select('nickname')
    .eq('client_id', params.clientId)
    .eq('is_active', true);
  const nicknameList = (nicks || []).map(n => n.nickname);
  if (params.supportingNickname && !nicknameList.includes(params.supportingNickname)) {
    nicknameList.push(params.supportingNickname);
  }
  if (nicknameList.length === 0) return false;

  const { data: orders } = await supabase
    .from('binance_order_history')
    .select('order_number')
    .in('counter_part_nick_name', nicknameList)
    .ilike('verified_name', verified)
    .limit(1);
  return (orders?.length || 0) > 0;
}
