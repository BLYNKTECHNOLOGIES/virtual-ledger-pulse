import { supabase } from "@/integrations/supabase/client";

let cachedBlockedPhones: Set<string> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getBlockedPhones(): Promise<Set<string>> {
  if (cachedBlockedPhones && Date.now() - cacheTime < CACHE_TTL) {
    return cachedBlockedPhones;
  }
  const { data } = await supabase
    .from("blocked_phone_numbers" as any)
    .select("phone");
  cachedBlockedPhones = new Set((data || []).map((r: any) => r.phone));
  cacheTime = Date.now();
  return cachedBlockedPhones;
}

export async function isPhoneBlocked(phone: string): Promise<boolean> {
  if (!phone || !phone.trim()) return false;
  const blocked = await getBlockedPhones();
  return blocked.has(phone.trim());
}
