import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeNickname } from "@/lib/clientIdentityResolver";

export interface ClientBeneficiaryAddedBank {
  bank_account_id: string;
  bank_name: string | null;
  account_name: string | null;
  account_number_last4: string | null;
  added_at: string;
}

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
  added_to_banks?: ClientBeneficiaryAddedBank[];
}

function normalizeName(value: string | null | undefined): string | null {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function mergeBeneficiary(
  primary: ClientBeneficiary,
  secondary: ClientBeneficiary
): ClientBeneficiary {
  const primaryTime = new Date(primary.last_seen_at).getTime();
  const secondaryTime = new Date(secondary.last_seen_at).getTime();
  const latest = secondaryTime > primaryTime ? secondary : primary;
  const fallback = latest === primary ? secondary : primary;

  return {
    ...latest,
    account_holder_name: latest.account_holder_name || fallback.account_holder_name,
    bank_name: latest.bank_name || fallback.bank_name,
    ifsc_code: latest.ifsc_code || fallback.ifsc_code,
    account_type: latest.account_type || fallback.account_type,
    account_opening_branch: latest.account_opening_branch || fallback.account_opening_branch,
    source_order_number: latest.source_order_number || fallback.source_order_number,
    occurrence_count: Math.max(latest.occurrence_count || 1, fallback.occurrence_count || 1),
  };
}

/**
 * Resolves bank beneficiary records for a client via the Binance nickname chain:
 *   client_binance_nicknames → binance_order_history (BUY) → beneficiary_records.
 * Only unmasked nicknames are used; masked values are useless for identity.
 */
export function useClientBeneficiaries(clientId: string | undefined, clientName?: string | null) {
  return useQuery({
    queryKey: ["client-beneficiaries", clientId, clientName],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientBeneficiary[]> => {
      if (!clientId) return [];
      const normalizedClientName = normalizeName(clientName);

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

      const orderNumbers = new Set<string>();

      // Step B — order numbers where counterparty (seller) matches one of these nicknames
      if (nicknames.length > 0) {
        const { data: orderRows, error: orderErr } = await supabase
          .from("binance_order_history")
          .select("order_number")
          .in("counter_part_nick_name", nicknames)
          .eq("trade_type", "BUY");
        if (orderErr) throw orderErr;

        for (const orderNumber of (orderRows || []).map((r) => r.order_number).filter(Boolean)) {
          orderNumbers.add(orderNumber);
        }
      }

      const collected: ClientBeneficiary[] = [];

      if (orderNumbers.size > 0) {
        const { data: benRows, error: benErr } = await supabase
          .from("beneficiary_records")
          .select(
            "id, account_holder_name, account_number, bank_name, ifsc_code, account_type, account_opening_branch, source_order_number, last_seen_at, occurrence_count"
          )
          .in("source_order_number", Array.from(orderNumbers))
          .order("last_seen_at", { ascending: false });
        if (benErr) throw benErr;

        collected.push(...((benRows || []) as ClientBeneficiary[]));
      }

      // Step C — fallback lookup by client/account-holder name.
      // This recovers older beneficiary rows where account_number was deduped correctly
      // but source_order_number/client_name was never backfilled on later captures.
      if (normalizedClientName) {
        const [holderResult, clientNameResult] = await Promise.all([
          supabase
            .from("beneficiary_records")
            .select(
              "id, account_holder_name, account_number, bank_name, ifsc_code, account_type, account_opening_branch, source_order_number, last_seen_at, occurrence_count"
            )
            .ilike("account_holder_name", normalizedClientName)
            .order("last_seen_at", { ascending: false }),
          supabase
            .from("beneficiary_records")
            .select(
              "id, account_holder_name, account_number, bank_name, ifsc_code, account_type, account_opening_branch, source_order_number, last_seen_at, occurrence_count"
            )
            .ilike("client_name", normalizedClientName)
            .order("last_seen_at", { ascending: false }),
        ]);

        if (holderResult.error) throw holderResult.error;
        if (clientNameResult.error) throw clientNameResult.error;

        collected.push(...((holderResult.data || []) as ClientBeneficiary[]));
        collected.push(...((clientNameResult.data || []) as ClientBeneficiary[]));
      }

      // Step D — direct fallback from synced purchase orders carrying captured seller payment details.
      // This is the true source for recent IMPS/bank captures even if beneficiary_records linkage is incomplete.
      const { data: syncRows, error: syncErr } = await supabase
        .from("terminal_purchase_sync")
        .select("binance_order_number, created_at, counterparty_name, order_data")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (syncErr) throw syncErr;

      for (const row of syncRows || []) {
        const orderData = (row.order_data || {}) as Record<string, any>;
        const sellerPaymentDetails = (orderData.seller_payment_details || null) as Record<string, any> | null;
        const accountNumber = String(sellerPaymentDetails?.accountNo || "").trim();
        if (!accountNumber || accountNumber.includes("@")) continue;

        collected.push({
          id: `sync-${row.binance_order_number}-${accountNumber}`,
          account_holder_name:
            normalizeName(sellerPaymentDetails?.accountName) ||
            normalizeName(row.counterparty_name) ||
            normalizedClientName,
          account_number: accountNumber,
          bank_name: normalizeName(sellerPaymentDetails?.bankName),
          ifsc_code: normalizeName(sellerPaymentDetails?.ifscCode),
          account_type: normalizeName(sellerPaymentDetails?.accountType),
          account_opening_branch: normalizeName(sellerPaymentDetails?.accountOpeningBranch),
          source_order_number: row.binance_order_number || null,
          last_seen_at: sellerPaymentDetails?.captured_at || row.created_at,
          occurrence_count: 1,
        });
      }

      // Dedupe by account_number and merge partially-enriched rows from multiple sources.
      const merged = new Map<string, ClientBeneficiary>();
      for (const row of collected) {
        const key = (row.account_number || "").trim();
        if (!key) continue;
        const existing = merged.get(key);
        merged.set(key, existing ? mergeBeneficiary(existing, row) : row);
      }

      return Array.from(merged.values()).sort(
        (a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
      );
    },
  });
}
