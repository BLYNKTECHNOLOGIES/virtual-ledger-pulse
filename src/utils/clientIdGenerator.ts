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
    .order('created_at', { ascending: true })
    .limit(1);
  
  if (error) {
    console.error('Error finding client by name:', error);
    return null;
  }
  
  return data && data.length > 0 ? data[0] : null;
};

/**
 * Create a new seller client from purchase order
 */
export const createSellerClient = async (
  supplierName: string,
  contactNumber?: string
): Promise<{ id: string; client_id: string } | null> => {
  try {
    const existingClient = await findClientByName(supplierName);
    if (existingClient) {
      const updates: Record<string, string> = {};
      if (contactNumber && !existingClient.phone) updates.phone = contactNumber;
      // Ensure seller flags are set on existing client
      if (!existingClient.is_seller) {
        updates.is_seller = 'true' as any;
        // Only set to PENDING if not already approved
        if (!existingClient.seller_approval_status || existingClient.seller_approval_status === 'NOT_APPLICABLE') {
          updates.seller_approval_status = 'PENDING' as any;
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('clients').update(updates).eq('id', existingClient.id);
      }
      return { id: existingClient.id, client_id: existingClient.client_id };
    }
    const clientId = await generateUniqueClientId();
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name: supplierName.trim(),
        client_id: clientId,
        client_type: 'SELLER',
        kyc_status: 'PENDING',
        date_of_onboarding: new Date().toISOString().split('T')[0],
        phone: contactNumber || null,
        risk_appetite: 'MEDIUM',
        is_seller: true,
        is_buyer: false,
        seller_approval_status: 'PENDING',
        buyer_approval_status: 'NOT_APPLICABLE',
      })
      .select('id, client_id')
      .single();
    if (error) {
      if (error.code === '23505') {
        console.log('Client already exists (race condition), fetching existing...');
        const existing = await findClientByName(supplierName);
        if (existing) return { id: existing.id, client_id: existing.client_id };
      }
      console.error('Error creating seller client:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Error in createSellerClient:', error);
    return null;
  }
};

/**
 * Create a new buyer client from sales order
 */
export const createBuyerClient = async (
  buyerName: string,
  contactNumber?: string,
  state?: string
): Promise<{ id: string; client_id: string } | null> => {
  try {
    // Always check for existing client first
    const existingClient = await findClientByName(buyerName);
    if (existingClient) {
      // Update missing fields on existing client
      const updates: Record<string, string> = {};
      if (contactNumber && !existingClient.phone) updates.phone = contactNumber;
      if (state && !existingClient.state) updates.state = state;
      if (Object.keys(updates).length > 0) {
        await supabase.from('clients').update(updates).eq('id', existingClient.id);
      }
      return { id: existingClient.id, client_id: existingClient.client_id };
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
        state: state || null,
        risk_appetite: 'MEDIUM',
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
        console.log('Client already exists (race condition), fetching existing...');
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
