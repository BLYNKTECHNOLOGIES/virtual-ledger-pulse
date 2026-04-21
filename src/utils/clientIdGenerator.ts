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
 * Create a new seller client from purchase order
 */
export const createSellerClient = async (
  supplierName: string,
  contactNumber?: string,
  evidence?: { binanceNickname?: string | null; verifiedName?: string | null }
): Promise<{ id: string; client_id: string } | null> => {
  try {
    // Check by name first
    const existingClient = await findClientByName(supplierName);
    
    // If no name match, also check by phone number
    if (!existingClient && contactNumber?.trim() && contactNumber.trim().length >= 10) {
      const { data: phoneMatch } = await supabase
        .from('clients')
        .select('id, client_id, name, phone, is_seller, seller_approval_status')
        .eq('is_deleted', false)
        .eq('phone', contactNumber.trim())
        .limit(1)
        .maybeSingle();
      if (phoneMatch) {
        const updates: Record<string, any> = {};
        if (!phoneMatch.is_seller) {
          updates.is_seller = true;
          if (!phoneMatch.seller_approval_status || phoneMatch.seller_approval_status === 'NOT_APPLICABLE') {
            updates.seller_approval_status = 'PENDING';
          }
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('clients').update(updates).eq('id', phoneMatch.id);
        }
        return { id: phoneMatch.id, client_id: phoneMatch.client_id };
      }
    }
    if (existingClient) {
      const updates: Record<string, string> = {};
      if (contactNumber && !existingClient.phone) updates.phone = contactNumber;
      if (!existingClient.is_seller) {
        updates.is_seller = 'true' as any;
        if (!existingClient.seller_approval_status || existingClient.seller_approval_status === 'NOT_APPLICABLE') {
          updates.seller_approval_status = 'PENDING' as any;
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('clients').update(updates).eq('id', existingClient.id);
      }
      return { id: existingClient.id, client_id: existingClient.client_id };
    }

    // Check by verified name — prevents duplicate sellers for the same Binance counterparty
    const { data: verifiedNameMatch } = await supabase
      .from('client_verified_names')
      .select('client_id')
      .eq('verified_name', supplierName.trim())
      .limit(1)
      .maybeSingle();

    if (verifiedNameMatch) {
      const { data: existingByVN } = await supabase
        .from('clients')
        .select('id, client_id, is_seller, seller_approval_status')
        .eq('id', verifiedNameMatch.client_id)
        .eq('is_deleted', false)
        .maybeSingle();
      if (existingByVN) {
        const updates: Record<string, any> = {};
        if (!existingByVN.is_seller) {
          updates.is_seller = true;
          if (!existingByVN.seller_approval_status || existingByVN.seller_approval_status === 'NOT_APPLICABLE') {
            updates.seller_approval_status = 'PENDING';
          }
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('clients').update(updates).eq('id', existingByVN.id);
        }
        return { id: existingByVN.id, client_id: existingByVN.client_id };
      }
    }

    const clientId = await generateUniqueClientId();
    // Sanitize masked/sentinel values — Binance returns "Unknown", "", or
    // "Use***" for completed orders. The DB sentinel-guard trigger rejects
    // these. Fall back to verified_name (KYC-backed, never masked) as the
    // identity anchor when the nickname is unusable.
    const isMaskedValue = (v?: string | null) =>
      !v || !v.trim() || v.includes('*') || v.trim().toLowerCase() === 'unknown';
    const cleanNickname = isMaskedValue(evidence?.binanceNickname) ? null : evidence!.binanceNickname!.trim();
    const cleanVerifiedName = isMaskedValue(evidence?.verifiedName) ? null : evidence!.verifiedName!.trim();

    // Use atomic RPC that creates client + supporting evidence in a single
    // transaction, satisfying the deferred trg_prevent_ghost_pending_client check.
    const { data, error } = await supabase.rpc('create_seller_client_with_evidence' as any, {
      p_name: supplierName.trim(),
      p_client_id: clientId,
      p_phone: contactNumber || null,
      p_nickname: cleanNickname,
      p_verified_name: cleanVerifiedName,
    });
    if (error) {
      if ((error as any).code === '23505') {
        const existing = await findClientByName(supplierName);
        if (existing) return { id: existing.id, client_id: existing.client_id };
      }
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
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name: buyerName.trim(),
        client_id: clientId,
        client_type: 'BUYER',
        kyc_status: 'PENDING',
        date_of_onboarding: new Date().toISOString().split('T')[0],
        phone: contactNumber || null,
        state: null,  // ALWAYS null — state must be entered manually during Buyer Approval
        risk_appetite: 'STANDARD',
        is_buyer: true,
        is_seller: false,
        buyer_approval_status: 'PENDING',
        seller_approval_status: 'NOT_APPLICABLE',
      })
      .select('id, client_id')
      .single();
    if (error) {
      // Handle race condition: unique constraint violation means another request created it
      if (error.code === '23505') {
        const existing = await findClientByName(buyerName);
        if (existing) return { id: existing.id, client_id: existing.client_id };
      }
      console.error('Error creating buyer client:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Error in createBuyerClient:', error);
    return null;
  }
};
