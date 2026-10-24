import { supabase } from "@/integrations/supabase/client";

/** Two or more active clients share the typed name and none was picked from the list. */
export class AmbiguousClientNameError extends Error {
  constructor(name: string, count: number) {
    super(`${count} clients are named “${name}”. Pick the right one from the customer list, so the order and the client's details go to the right person.`);
    this.name = "AmbiguousClientNameError";
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The client a manually entered sale belongs to. Never a guess:
 * - the client picked from the customer list wins (typing in the field clears the pick);
 * - without a pick, a typed name links only when exactly one active client has exactly that name
 *   (case and outer spaces ignored: the rule the database applies when it fills sales_orders.client_id);
 * - two or more namesakes throw AmbiguousClientNameError, so nothing is saved until the operator picks;
 * - no match means a new buyer (null).
 */
export async function resolveSalesOrderClientId(
  selectedClientId: string | null | undefined,
  clientName: string,
): Promise<string | null> {
  if (selectedClientId) return selectedClientId;
  const name = (clientName || "").trim();
  if (!name) return null;

  // Wildcards only widen the candidate list; the exact comparison below decides.
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("is_deleted", false)
    .ilike("name", `%${name}%`)
    .limit(1000);
  if (error) throw error;

  const matches = (data || []).filter((c: any) => typeof c?.name === "string" && sameName(c.name, name));
  if (matches.length > 1) throw new AmbiguousClientNameError(name, matches.length);
  return matches.length === 1 ? matches[0].id : null;
}
