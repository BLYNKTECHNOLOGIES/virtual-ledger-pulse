import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";

interface ExchangeAccountRow {
  id: string;
  account_name: string;
  color: string | null;
}

/**
 * Lightweight, self-contained lookup of all exchange accounts.
 * Cached for the whole session so the badge can render anywhere
 * (ERP entry feed, terminal sync tabs) without a context provider.
 */
function useExchangeAccountMap() {
  return useQuery({
    queryKey: ["exchange-account-map"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("terminal_exchange_accounts")
        .select("id, account_name, color");
      const map = new Map<string, ExchangeAccountRow>();
      for (const row of (data || []) as ExchangeAccountRow[]) {
        map.set(row.id, row);
      }
      return map;
    },
  });
}

/** Strip the trailing " Binance" so the badge stays compact. */
function shortLabel(name: string): string {
  return name.replace(/\s*binance\s*$/i, "").trim() || name;
}

interface Props {
  accountId: string | null | undefined;
  className?: string;
}

export function ExchangeAccountBadge({ accountId, className }: Props) {
  const { data: map } = useExchangeAccountMap();
  if (!accountId) return null;
  const account = map?.get(accountId);
  if (!account) return null;

  return (
    <Badge
      variant="outline"
      className={`gap-1 px-1.5 py-0 text-[10px] font-medium border-border text-muted-foreground ${className || ""}`}
      style={account.color ? { borderColor: account.color, color: account.color } : undefined}
    >
      <Building2 className="h-2.5 w-2.5" />
      {shortLabel(account.account_name)}
    </Badge>
  );
}
