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
 * Resolve the client that OWNS a given Binance nickname (proxy for the stable userNo).
 * Nickname ownership is the strongest identity anchor available at creation time and
 * takes precedence over name matching, so two distinct accounts sharing a KYC name
 * are never merged.
 */
const isMaskedNick = (v?: string | null) =>
  !v || !v.trim() || v.includes('*') || v.trim().toLowerCase() === 'unknown';

export const resolveClientByNickname = async (
  nickname: string
): Promise<{ id: string; client_id: string; is_seller?: boolean; seller_approval_status?: string | null } | null> => {
  const { data: link } = await supabase
    .from('client_binance_nicknames')
    .select('client_id')
    .eq('nickname', nickname.trim())
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!link?.client_id) return null;
  const { data: c } = await supabase
    .from('clients')
    .select('id, client_id, is_seller, seller_approval_status')
    .eq('id', link.client_id)
    .eq('is_deleted', false)
    .maybeSingle();
  return (c as any) || null;
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
  evidence?: { binanceNickname?: string | null; verifiedName?: string | null }
): Promise<{ id: string; client_id: string } | null> => {
  try {
    const cleanNickname = isMaskedNick(evidence?.binanceNickname) ? null : evidence!.binanceNickname!.trim();
    const cleanVerifiedName = isMaskedNick(evidence?.verifiedName) ? null : evidence!.verifiedName!.trim();

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

    // 1. Identity-first: nickname (proxy for stable userNo).
    if (cleanNickname) {
      const owner = await resolveClientByNickname(cleanNickname);
      if (owner) return markSeller(owner);
    }

    // 2. Phone number is a strong, person-specific identity anchor.
    if (contactNumber?.trim() && contactNumber.trim().length >= 10) {
      const { data: phoneMatch } = await supabase
        .from('clients')
        .select('id, client_id, is_seller, seller_approval_status')
        .eq('is_deleted', false)
        .eq('phone', contactNumber.trim())
        .limit(1)
        .maybeSingle();
      if (phoneMatch) return markSeller(phoneMatch as any);
    }

    // 3. Fallback name / verified-name matching — ONLY when there is no real nickname.
    //    With a real Binance nickname present but unowned, we must create a SEPARATE
    //    client (the RPC auto-disambiguates the name) rather than merging same-name people.
    if (!cleanNickname) {
      const existingClient = await findClientByName(supplierName);
      if (existingClient) return markSeller(existingClient as any);

      if (cleanVerifiedName) {
        const { data: verifiedNameMatch } = await supabase
          .from('client_verified_names')
          .select('client_id')
          .eq('verified_name', cleanVerifiedName)
          .limit(1)
          .maybeSingle();
        if (verifiedNameMatch) {
          const { data: existingByVN } = await supabase
            .from('clients')
            .select('id, client_id, is_seller, seller_approval_status')
            .eq('id', verifiedNameMatch.client_id)
            .eq('is_deleted', false)
            .maybeSingle();
          if (existingByVN) return markSeller(existingByVN as any);
        }
      }
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
  _state?: string  // Intentionally ignored — state must be entered during Buyer Approval
): Promise<{ id: string; client_id: string } | null> => {
  try {
    // Always check for existing client first (by name)
    const existingClient = await findClientByName(buyerName);
    if (existingClient) {
      const updates: Record<string, string> = {};
      if (contactNumber && !existingClient.phone) updates.phone = contactNumber;
      if (Object.keys(updates).length > 0) {
        await supabase.from('clients').update(updates).eq('id', existingClient.id);
      }
      return { id: existingClient.id, client_id: existingClient.client_id };
    }
    
    // Also check by phone number to prevent duplicates
    if (contactNumber?.trim() && contactNumber.trim().length >= 10) {
      const { data: phoneMatch } = await supabase
        .from('clients')
        .select('id, client_id, name, phone')
        .eq('is_deleted', false)
        .eq('phone', contactNumber.trim())
        .limit(1)
        .maybeSingle();
      if (phoneMatch) {
        return { id: phoneMatch.id, client_id: phoneMatch.client_id };
      }
    }
    const clientId = await generateUniqueClientId();
    // Use atomic RPC that creates client + onboarding-approval evidence row in a
    // single transaction, satisfying the deferred trg_prevent_ghost_pending_client check.
    const { data, error } = await supabase.rpc('create_buyer_client_with_evidence' as any, {
      p_name: buyerName.trim(),
      p_client_id: clientId,
      p_phone: contactNumber || null,
      p_order_amount: 0,
      p_order_date: new Date().toISOString().split('T')[0],
      p_sales_order_id: null,
    });
    if (error) {
      if ((error as any).code === '23505') {
        const existing = await findClientByName(buyerName);
        if (existing) return { id: existing.id, client_id: existing.client_id };
      }
      console.error('Error creating buyer client (RPC):', error);
      const msg = (error as any).message || 'Unknown database error';
      const code = (error as any).code ? ` [${(error as any).code}]` : '';
      const details = (error as any).details ? ` — ${(error as any).details}` : '';
      throw new Error(`DB${code}: ${msg}${details}`);
    }
    const row = Array.isArray(data) ? (data as any[])[0] : data;
    return row ? { id: (row as any).id, client_id: (row as any).client_id } : null;
  } catch (error: any) {
    console.error('Error in createBuyerClient:', error);
    throw error;
  }
};
