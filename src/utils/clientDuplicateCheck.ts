import { supabase } from "@/integrations/supabase/client";

export interface DuplicateMatch {
  id: string;
  name: string;
  phone: string | null;
  client_id: string;
  client_type: string;
}

/**
 * Check if a client with the same phone or name already exists.
 * Pass excludeClientId to skip the current client (for edit flows).
 */
export async function checkClientDuplicates(
  name: string,
  phone?: string | null,
  excludeClientId?: string
): Promise<{ phoneMatches: DuplicateMatch[]; nameMatches: DuplicateMatch[] }> {
  const phoneMatches: DuplicateMatch[] = [];
  const nameMatches: DuplicateMatch[] = [];

  const trimmedPhone = phone?.trim();
  const trimmedName = name?.trim();

  // Check phone duplicates (only for real phone numbers, not placeholders)
  if (trimmedPhone && trimmedPhone.length >= 10 && trimmedPhone !== 'Terminal Counterparty') {
    let query = supabase
      .from('clients')
      .select('id, name, phone, client_id, client_type')
      .eq('is_deleted', false)
      .eq('phone', trimmedPhone)
      .limit(5);
    if (excludeClientId) {
      query = query.neq('id', excludeClientId);
    }
    const { data } = await query;
    if (data?.length) {
      phoneMatches.push(...data);
    }
  }

  // Check name duplicates (exact case-insensitive match)
  if (trimmedName && trimmedName.length >= 2) {
    let query = supabase
      .from('clients')
      .select('id, name, phone, client_id, client_type')
      .eq('is_deleted', false)
      .ilike('name', trimmedName)
      .limit(5);
    if (excludeClientId) {
      query = query.neq('id', excludeClientId);
    }
    const { data } = await query;
    if (data?.length) {
      nameMatches.push(...data);
    }
  }

  return { phoneMatches, nameMatches };
}

/**
 * Check if a phone number is already used by another client.
 * Returns the matching client(s) if found, empty array if unique.
 * Pass excludeClientId to skip the current client during edits.
 */
export async function checkPhoneUniqueness(
  phone: string,
  excludeClientId?: string
): Promise<DuplicateMatch[]> {
  const trimmed = phone?.trim();
  if (!trimmed || trimmed.length < 10) return [];

  let query = supabase
    .from('clients')
    .select('id, name, phone, client_id, client_type')
    .eq('is_deleted', false)
    .eq('phone', trimmed)
    .limit(5);

  if (excludeClientId) {
    query = query.neq('id', excludeClientId);
  }

  const { data } = await query;
  return data || [];
}
