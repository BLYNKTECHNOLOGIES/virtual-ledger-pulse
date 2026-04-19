import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeNickname } from "@/lib/clientIdentityResolver";

export interface ClientBeneficiary {
  id: string;
  account_holder_name: string | null;
  account_number: string;
  bank_name: string | null;
  ifsc_code: string | null;
  account_type: string | null;
  account_opening_branch: string | null;
  source_order_number: string | null;
  last_seen_at: string;
  occurrence_count: number;
}

/**
 * Resolves bank beneficiary records for a client via the Binance nickname chain:
 *   client_binance_nicknames → binance_order_history (BUY) → beneficiary_records.
 * Only unmasked nicknames are used; masked values are useless for identity.
 */
export function useClientBeneficiaries(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-beneficiaries", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientBeneficiary[]> => {
      if (!clientId) return [];

      // Step A — active, unmasked nicknames for this client
      const { data: nickRows, error: nickErr } = await supabase
        .from("client_binance_nicknames")
        .select("nickname")
        .eq("client_id", clientId)
        .eq("is_active", true);
      if (nickErr) throw nickErr;

      const nicknames = Array.from(
        new Set(
          (nickRows || [])
            .map((r) => sanitizeNickname(r.nickname))
            .filter((n): n is string => !!n)
        )
      );
      if (nicknames.length === 0) return [];

      // Step B — order numbers where counterparty (seller) matches one of these nicknames
      const { data: orderRows, error: orderErr } = await supabase
        .from("binance_order_history")
        .select("order_number")
        .in("counter_part_nick_name", nicknames)
        .eq("trade_type", "BUY");
      if (orderErr) throw orderErr;

      const orderNumbers = Array.from(
        new Set((orderRows || []).map((r) => r.order_number).filter(Boolean))
      );
      if (orderNumbers.length === 0) return [];

      // Step C — beneficiaries captured from those orders
      const { data: benRows, error: benErr } = await supabase
        .from("beneficiary_records")
        .select(
          "id, account_holder_name, account_number, bank_name, ifsc_code, account_type, account_opening_branch, source_order_number, last_seen_at, occurrence_count"
        )
        .in("source_order_number", orderNumbers)
        .order("last_seen_at", { ascending: false });
      if (benErr) throw benErr;

      // Dedupe by account_number — keep latest (already sorted desc)
      const seen = new Set<string>();
      const out: ClientBeneficiary[] = [];
      for (const row of benRows || []) {
        const key = (row.account_number || "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(row as ClientBeneficiary);
      }
      return out;
    },
  });
}
