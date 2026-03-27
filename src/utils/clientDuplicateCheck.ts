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
 * Returns matches for UI warning/blocking.
 */
export async function checkClientDuplicates(
  name: string,
  phone?: string | null
): Promise<{ phoneMatches: DuplicateMatch[]; nameMatches: DuplicateMatch[] }> {
  const phoneMatches: DuplicateMatch[] = [];
  const nameMatches: DuplicateMatch[] = [];

  const trimmedPhone = phone?.trim();
  const trimmedName = name?.trim();

  // Check phone duplicates (only for real phone numbers, not placeholders)
  if (trimmedPhone && trimmedPhone.length >= 10 && trimmedPhone !== 'Terminal Counterparty') {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, client_id, client_type')
      .eq('is_deleted', false)
      .eq('phone', trimmedPhone)
      .limit(5);
    if (data?.length) {
      phoneMatches.push(...data);
    }
  }

  // Check name duplicates (exact case-insensitive match)
  if (trimmedName && trimmedName.length >= 2) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, client_id, client_type')
      .eq('is_deleted', false)
      .ilike('name', trimmedName)
      .limit(5);
    if (data?.length) {
      nameMatches.push(...data);
    }
  }

  return { phoneMatches, nameMatches };
}
