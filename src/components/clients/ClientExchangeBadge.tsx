import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";

interface Props {
  clientId?: string;
  clientName?: string | null;
}

/** Strip a trailing " Binance" so the badge stays compact (e.g. "ASEC Binance" -> "ASEC"). */
function shortLabel(name: string): string {
  return name.replace(/\s*binance\s*$/i, "").trim() || name;
}

/**
 * Resolves the exchange account a client belongs to, based on the WALLET of their
 * very first (earliest) order — across both sales and purchase orders.
 *  - If that wallet is linked to a terminal exchange account => show ASEC / Blynk.
 *  - Otherwise => show the raw wallet name (KuCoin, Coinex, Bitget, Bybit, ...).
 */
export function ClientExchangeBadge({ clientId, clientName }: Props) {
  const { data } = useQuery({
    queryKey: ["client-exchange-account", clientId, clientName],
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // 1) Earliest sales order (client linked by client_id)
      const salesPromise = supabase
        .from("sales_orders")
        .select("wallet_id, order_date, created_at")
        .eq("client_id", clientId!)
        .neq("status", "CANCELLED")
        .not("wallet_id", "is", null)
        .order("order_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      // 2) Earliest purchase order (supplier linked by name)
      const purchasePromise = clientName
        ? supabase
            .from("purchase_orders")
            .select("wallet_id, order_date, created_at")
            .eq("supplier_name", clientName)
            .neq("status", "CANCELLED")
            .not("wallet_id", "is", null)
            .order("order_date", { ascending: true })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null } as any);

      const [salesRes, purchaseRes] = await Promise.all([salesPromise, purchasePromise]);

      const candidates = [salesRes.data, purchaseRes.data].filter(Boolean) as any[];
      if (candidates.length === 0) return null;

      // Pick the truly earliest order across both order types.
      candidates.sort((a, b) => {
        const ta = new Date(a.order_date || a.created_at).getTime();
        const tb = new Date(b.order_date || b.created_at).getTime();
        return ta - tb;
      });
      const walletId = candidates[0].wallet_id as string | null;
      if (!walletId) return null;

      // Map wallet -> exchange account (ASEC / Blynk) when linked, else wallet name.
      const [linkRes, walletRes] = await Promise.all([
        supabase
          .from("terminal_wallet_links")
          .select("exchange_account_id, terminal_exchange_accounts:exchange_account_id(account_name)")
          .eq("wallet_id", walletId)
          .eq("status", "active")
          .maybeSingle(),
        supabase.from("wallets").select("wallet_name").eq("id", walletId).maybeSingle(),
      ]);

      const accountName = (linkRes.data?.terminal_exchange_accounts as any)?.account_name as string | undefined;
      const label = accountName ? shortLabel(accountName) : walletRes.data?.wallet_name?.trim();
      if (!label) return null;
      return { label, isExchangeAccount: !!accountName };
    },
  });

  if (!data) return null;

  return (
    <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary">
      <Building2 className="h-3 w-3" />
      {data.label}
    </Badge>
  );
}
