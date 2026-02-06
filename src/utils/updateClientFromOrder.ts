import { supabase } from "@/integrations/supabase/client";

/**
 * Updates an existing client's phone and state if the order provides values
 * that were previously missing on the client record.
 * This ensures client master data stays up-to-date from order entry.
 */
export async function updateClientFromOrder({
  clientId,
  clientName,
  phone,
  state,
  panNumber,
}: {
  clientId?: string;
  clientName?: string;
  phone?: string | null;
  state?: string | null;
  panNumber?: string | null;
}) {
  try {
    // Find the client - by ID first, then by exact name match
    let client: any = null;

    if (clientId) {
      const { data } = await supabase
        .from('clients')
        .select('id, phone, state, pan_card_number')
        .eq('id', clientId)
        .single();
      client = data;
    } else if (clientName) {
      const { data } = await supabase
        .from('clients')
        .select('id, phone, state, pan_card_number')
        .ilike('name', clientName)
        .limit(1)
        .maybeSingle();
      client = data;
    }

    if (!client) return;

    // Build update payload only for fields that are provided and currently missing
    const updates: Record<string, string> = {};

    if (phone && !client.phone) {
      updates.phone = phone;
    }
    // Also update phone if provided and different (user may have corrected it)
    if (phone && client.phone && phone !== client.phone) {
      updates.phone = phone;
    }

    if (state && !client.state) {
      updates.state = state;
    }
    if (state && client.state && state !== client.state) {
      updates.state = state;
    }

    if (panNumber && !client.pan_card_number) {
      updates.pan_card_number = panNumber;
    }

    if (Object.keys(updates).length === 0) return;

    const { error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', client.id);

    if (error) {
      console.error('Failed to update client from order:', error);
    } else {
      console.log('✅ Client updated from order data:', updates);
    }
  } catch (err) {
    console.error('Error in updateClientFromOrder:', err);
  }
}
