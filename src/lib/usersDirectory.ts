import { supabase } from "@/integrations/supabase/client";

/**
 * Non-sensitive staff directory.
 *
 * The `users` table is row-restricted (self / managers / HR / user-management roles)
 * because it carries PII (email, phone, login + lockout metadata).
 * `users_directory()` is a security-definer function that exposes ONLY non-sensitive
 * identity fields (id, username, name, avatar, status, role/department/position ids)
 * so name lookups keep working for every signed-in staff member.
 *
 * Returns a PostgREST builder, so `.select()`, `.eq()`, `.in()`, `.order()` etc. all work.
 */
export function usersDirectory() {
  return (supabase as any).rpc("users_directory");
}

export interface UserContact {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

/**
 * Targeted contact lookup for notification flows (max 200 explicit ids, no enumeration).
 */
export async function fetchUserContacts(ids: string[]): Promise<UserContact[]> {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (!unique.length) return [];
  const { data, error } = await (supabase as any).rpc("get_users_contact", { _ids: unique });
  if (error) {
    console.warn("fetchUserContacts failed:", error.message);
    return [];
  }
  return (data || []) as UserContact[];
}
