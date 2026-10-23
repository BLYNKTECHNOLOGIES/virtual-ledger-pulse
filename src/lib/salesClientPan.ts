import { supabase } from '@/integrations/supabase/client';

/** PAN belongs to the explicitly linked client, never a matching display name. */
export async function fetchSalesClientPan(clientId: string | null | undefined, canViewClient: boolean): Promise<string | null> {
  if (!canViewClient || !clientId) return null;
  const { data, error } = await supabase
    .from('clients')
    .select('pan_card_number')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data?.pan_card_number?.trim() || null;
}