import { supabase } from "@/integrations/supabase/client";

/**
 * Generate a unique 6-character alphanumeric client ID
 * Format: 6 random characters (e.g., "7X9K2M")
 */
export const generateUniqueClientId = async (): Promise<string> => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let clientId = '';
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!isUnique && attempts < maxAttempts) {
    clientId = Array.from({ length: 6 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    
    // Check uniqueness in database
    const { data, error } = await supabase
      .from('clients')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking client ID uniqueness:', error);
      attempts++;
      continue;
    }
    
    isUnique = !data;
    attempts++;
  }
  
  if (!isUnique) {
    // Fallback: append timestamp to ensure uniqueness
    clientId = clientId.slice(0, 4) + Date.now().toString(36).slice(-2).toUpperCase();
  }
  
  return clientId;
};

/**
 * Check if a client with the given name already exists
 * @param name - The client name to check
 * @returns The existing client if found, null otherwise
 */
export const findClientByName = async (name: string) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .ilike('name', name.trim())
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error finding client by name:', error);
    return null;
  }
  
  if (!data || data.length === 0) return null;
  
  // If multiple clients share the same name, return null to force manual disambiguation
  if (data.length > 1) {
    console.warn(`[findClientByName] Multiple clients found for "${name}" (${data.length} matches) — skipping auto-map, requires manual selection`);
    return null;
  }
  
  return data[0];
};

/**
 * Find ALL clients matching a given name (for disambiguation UI)
 */
export const findAllClientsByName = async (name: string) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .ilike('name', name.trim())
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error finding clients by name:', error);
    return [];
  }
  
  return data || [];
};

/**
 * Masked/sentinel nickname check. Nicknames are stored for DISPLAY only and are
 * NEVER used to resolve/match a client — matching is strictly by Binance userNo.
 */
const isMaskedNick = (v?: string | null) =>
  !v || !v.trim() || v.includes('*') || v.trim().toLowerCase() === 'unknown';

/**
 * Resolve the client that OWNS a given Binance userNo — the STABLE, unique numeric
 * account identifier. This is the strongest identity anchor available and takes
 * precedence over nickname, phone and name matching.
 */
export const resolveClientByUserNo = async (
  cpUserNo: string
): Promise<{ id: string; client_id: string; is_seller?: boolean; seller_approval_status?: string | null } | null> => {
  const clean = String(cpUserNo || '').trim();
  if (!clean) return null;
  const { data: resolved } = await supabase.rpc('resolve_client_by_userno' as any, { p_cp_userno: clean });
  const row = Array.isArray(resolved) ? resolved[0] : resolved;
  if (!row?.client_id) return null;
  const { data: c } = await supabase
    .from('clients')
    .select('id, client_id, is_seller, seller_approval_status')
    .eq('client_id', (row as any).client_id)
    .eq('is_deleted', false)
    .maybeSingle();
  return (c as any) || null;
};

/** Persist a client↔userNo mapping (best-effort; never throws). */
const linkClientUserNo = async (clientId: string, cpUserNo?: string | null) => {
  const clean = String(cpUserNo || '').trim();
  if (!clean || !clientId) return;
  try {
    await supabase.rpc('link_client_userno' as any, { p_client_id: clientId, p_cp_userno: clean });
  } catch (e) {
    console.warn('link_client_userno failed', e);
  }
};

/**
 * Create a new seller client from purchase order.
 * Identity resolution is userNo/nickname-first: a real (unmasked) nickname owned by an
 * existing client always wins. Name / verified-name matching is only used as a fallback
 * when NO real nickname is available, because same-KYC-name accounts are legitimately
 * distinct people and must not be auto-merged.
 */
export const createSellerClient = async (
  supplierName: string,
  contactNumber?: string,
  evidence?: { binanceNickname?: string | null; verifiedName?: string | null; cpUserNo?: string | null }
): Promise<{ id: string; client_id: string } | null> => {
  try {
    const cleanNickname = isMaskedNick(evidence?.binanceNickname) ? null : evidence!.binanceNickname!.trim();
    const cleanVerifiedName = isMaskedNick(evidence?.verifiedName) ? null : evidence!.verifiedName!.trim();
    const cpUserNo = String(evidence?.cpUserNo || '').trim() || null;

    const markSeller = async (c: { id: string; client_id: string; is_seller?: boolean; seller_approval_status?: string | null }) => {
      const updates: Record<string, any> = {};
      if (contactNumber) {
        const { data: existing } = await supabase.from('clients').select('phone').eq('id', c.id).maybeSingle();
        if (existing && !existing.phone) updates.phone = contactNumber;
      }
      if (!c.is_seller) {
        updates.is_seller = true;
        if (!c.seller_approval_status || c.seller_approval_status === 'NOT_APPLICABLE') {
          updates.seller_approval_status = 'PENDING';
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('clients').update(updates).eq('id', c.id);
      }
      return { id: c.id, client_id: c.client_id };
    };

    // Client resolution is STRICTLY by Binance userNo — the stable, unique
    // account identifier. Nickname / verified-name / phone / name matching have
    // been removed: they are not globally unique and caused cross-contamination.
    // If the userNo is unknown, a NEW client is created (no auto-merge).
    if (cpUserNo) {
      const owner = await resolveClientByUserNo(cpUserNo);
      if (owner) return markSeller(owner);
    }

    const clientId = await generateUniqueClientId();

    // Atomic RPC — creates client (+ nickname/verified-name evidence) in one transaction
    // and auto-disambiguates the name on collision so distinct accounts stay separate.
    const { data, error } = await supabase.rpc('create_seller_client_with_evidence' as any, {
      p_name: supplierName.trim(),
      p_client_id: clientId,
      p_phone: contactNumber || null,
      p_nickname: cleanNickname,
      p_verified_name: cleanVerifiedName,
    });
    if (error) {
      console.error('Error creating seller client (RPC):', error);
      const msg = (error as any).message || 'Unknown database error';
      const code = (error as any).code ? ` [${(error as any).code}]` : '';
      const details = (error as any).details ? ` — ${(error as any).details}` : '';
      throw new Error(`DB${code}: ${msg}${details}`);
    }
    const row = Array.isArray(data) ? (data as any[])[0] : data;
    if (row && cpUserNo) await linkClientUserNo((row as any).client_id, cpUserNo);
    return row ? { id: (row as any).id, client_id: (row as any).client_id } : null;
  } catch (error: any) {
    console.error('Error in createSellerClient:', error);
    throw error;
  }
};

/**
 * Create a new buyer client from sales order.
 * IMPORTANT: State is intentionally NOT stored here — new clients created from Sales
 * must go through Buyer Approval where State is entered manually. Never auto-populate state.
 */
export const createBuyerClient = async (
  buyerName: string,
  contactNumber?: string,
  _state?: string,  // Intentionally ignored — state must be entered during Buyer Approval
  evidence?: { binanceNickname?: string | null; verifiedName?: string | null; cpUserNo?: string | null }
): Promise<{ id: string; client_id: string } | null> => {
  try {
    const cleanNickname = isMaskedNick(evidence?.binanceNickname) ? null : evidence!.binanceNickname!.trim();
    const cleanVerifiedName = isMaskedNick(evidence?.verifiedName) ? null : evidence!.verifiedName!.trim();
    const cpUserNo = String(evidence?.cpUserNo || '').trim() || null;

    // Client resolution is STRICTLY by Binance userNo — the stable, unique
    // account identifier. Nickname / verified-name / phone / name matching have
    // been removed: they are not globally unique and caused cross-contamination.
    // If the userNo is unknown, a NEW client is created (no auto-merge).
    if (cpUserNo) {
      const owner = await resolveClientByUserNo(cpUserNo);
      if (owner) {
        if (contactNumber) {
          const { data: existing } = await supabase.from('clients').select('phone').eq('id', owner.id).maybeSingle();
          if (existing && !existing.phone) {
            await supabase.from('clients').update({ phone: contactNumber }).eq('id', owner.id);
          }
        }
        return { id: owner.id, client_id: owner.client_id };
      }
    }

    const clientId = await generateUniqueClientId();
    // Atomic RPC — creates client + onboarding-approval evidence in one transaction and
    // auto-disambiguates the name on collision so distinct accounts stay separate.
    const { data, error } = await supabase.rpc('create_buyer_client_with_evidence' as any, {
      p_name: buyerName.trim(),
      p_client_id: clientId,
      p_phone: contactNumber || null,
      p_order_amount: 0,
      p_order_date: new Date().toISOString().split('T')[0],
      p_sales_order_id: null,
      p_nickname: cleanNickname,
    });
    if (error) {
      console.error('Error creating buyer client (RPC):', error);
      const msg = (error as any).message || 'Unknown database error';
      const code = (error as any).code ? ` [${(error as any).code}]` : '';
      const details = (error as any).details ? ` — ${(error as any).details}` : '';
      throw new Error(`DB${code}: ${msg}${details}`);
    }
    const row = Array.isArray(data) ? (data as any[])[0] : data;
    if (row && cpUserNo) await linkClientUserNo((row as any).client_id, cpUserNo);
    return row ? { id: (row as any).id, client_id: (row as any).client_id } : null;
  } catch (error: any) {
    console.error('Error in createBuyerClient:', error);
    throw error;
  }
};
