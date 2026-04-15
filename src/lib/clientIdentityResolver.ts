import { supabase } from "@/integrations/supabase/client";

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

  // Priority 3: Name-based match
  if (counterpartyName !== 'Unknown') {
    const id = clientNameMap.get(counterpartyName.trim().toLowerCase()) || null;
    if (id) return { clientId: id, resolvedVia: 'name_match' };
  }

  return { clientId: null, resolvedVia: null };
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
