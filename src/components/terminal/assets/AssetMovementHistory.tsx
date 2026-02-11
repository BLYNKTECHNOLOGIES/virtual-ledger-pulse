import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Repeat, LayoutList, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type MovementType = "all" | "deposit" | "withdrawal" | "transfer" | "p2p";

interface UnifiedMovement {
  id: string;
  type: MovementType;
  asset: string;
  amount: number;
  status: string;
  timestamp: number;
  details: string;
  network?: string;
  txId?: string;
  address?: string;
  fee?: number;
  counterparty?: string;
  fiat?: string;
  fiatAmount?: number;
}

const DEPOSIT_STATUS: Record<string, string> = {
  "0": "Pending",
  "6": "Credited",
  "1": "Success",
  "7": "Wrong Deposit",
  "8": "Waiting User Confirm",
};

const WITHDRAW_STATUS: Record<string, string> = {
  "0": "Email Sent",
  "1": "Cancelled",
  "2": "Awaiting Approval",
  "3": "Rejected",
  "4": "Processing",
  "5": "Failure",
  "6": "Completed",
};

// Read cached movements from DB
function useMovementsFromDB() {
  return useQuery({
    queryKey: ["asset_movement_history_db"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_movement_history")
        .select("*")
        .order("movement_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    staleTime: 10000,
  });
}

// Read P2P from existing DB table
function useP2PHistory() {
  return useQuery({
    queryKey: ["binance_p2p_movement_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("binance_order_history")
        .select("*")
        .in("order_status", ["COMPLETED"])
        .order("create_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });
}

// Sync trigger
function useSyncMovements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (force: boolean = false) => {
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: { action: "syncAssetMovements", force },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["asset_movement_history_db"] });
      if (data?.data?.synced) {
        toast.success(`Synced ${data.data.totalUpserted} movements`);
      }
    },
    onError: (err: Error) => toast.error(`Sync failed: ${err.message}`),
  });
}

// Auto-sync on mount if stale
function useAutoSync() {
  const sync = useSyncMovements();
  const [hasTriggered, setHasTriggered] = useState(false);

  useEffect(() => {
    if (hasTriggered) return;
    setHasTriggered(true);
    // Check sync metadata
    supabase
      .from("asset_movement_sync_metadata")
      .select("last_sync_at")
      .eq("id", "default")
      .maybeSingle()
      .then(({ data }) => {
        const lastSync = data?.last_sync_at ? new Date(data.last_sync_at).getTime() : 0;
        const fiveMin = 5 * 60 * 1000;
        if (Date.now() - lastSync > fiveMin) {
          sync.mutate(false);
        }
      });
  }, [hasTriggered]);

  return sync;
}

export function AssetMovementHistory() {
  const [filter, setFilter] = useState<MovementType>("all");
  const { data: dbMovements, isLoading: loadingDB } = useMovementsFromDB();
  const { data: p2pOrders, isLoading: loadingP2P } = useP2PHistory();
  const sync = useAutoSync();

  const isLoading = loadingDB || loadingP2P;

  const unified = useMemo(() => {
    const movements: UnifiedMovement[] = [];

    // DB cached movements (deposits, withdrawals, transfers)
    if (dbMovements) {
      for (const m of dbMovements) {
        const mType = m.movement_type as MovementType;
        let statusLabel = m.status || "";
        if (mType === "deposit") statusLabel = DEPOSIT_STATUS[m.status || ""] || m.status || "";
        if (mType === "withdrawal") statusLabel = WITHDRAW_STATUS[m.status || ""] || m.status || "";

        let details = "";
        if (mType === "deposit") details = `${m.network || ""} Deposit`;
        else if (mType === "withdrawal") details = `${m.network || ""} Withdrawal`;
        else if (mType === "transfer") details = m.transfer_direction || "Internal Transfer";

        movements.push({
          id: m.id,
          type: mType,
          asset: m.asset || "",
          amount: Number(m.amount) || 0,
          status: statusLabel,
          timestamp: Number(m.movement_time) || 0,
          details,
          network: m.network || undefined,
          txId: m.tx_id || undefined,
          address: m.address || undefined,
          fee: Number(m.fee) || undefined,
        });
      }
    }

    // P2P from order history
    if (p2pOrders) {
      for (const o of p2pOrders) {
        movements.push({
          id: `p2p-${o.order_number}`,
          type: "p2p",
          asset: o.asset || "",
          amount: parseFloat(o.amount || "0"),
          status: o.order_status || "",
          timestamp: o.create_time || 0,
          details: `P2P ${o.trade_type || ""}`,
          counterparty: o.counter_part_nick_name || "",
          fiat: o.fiat_unit || "",
          fiatAmount: parseFloat(o.total_price || "0"),
          fee: parseFloat(o.commission || "0"),
        });
      }
    }

    movements.sort((a, b) => b.timestamp - a.timestamp);
    return movements;
  }, [dbMovements, p2pOrders]);

  const filtered = filter === "all" ? unified : unified.filter((m) => m.type === filter);

  const typeIcon = (type: MovementType) => {
    switch (type) {
      case "deposit": return <ArrowDownLeft className="h-3.5 w-3.5 text-trade-buy" />;
      case "withdrawal": return <ArrowUpRight className="h-3.5 w-3.5 text-trade-sell" />;
      case "transfer": return <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />;
      case "p2p": return <Repeat className="h-3.5 w-3.5 text-amber-400" />;
      default: return null;
    }
  };

  const typeBadge = (type: MovementType) => {
    const styles: Record<string, string> = {
      deposit: "bg-trade-buy/10 text-trade-buy",
      withdrawal: "bg-trade-sell/10 text-trade-sell",
      transfer: "bg-primary/10 text-primary",
      p2p: "bg-amber-500/10 text-amber-400",
    };
    const labels: Record<string, string> = {
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      transfer: "Transfer",
      p2p: "P2P",
    };
    return (
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${styles[type] || ""}`}>
        {labels[type] || type}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const s = status.toLowerCase();
    let cls = "bg-muted/50 text-muted-foreground";
    if (s === "success" || s === "completed" || s === "confirmed" || s === "credited") {
      cls = "bg-trade-buy/10 text-trade-buy";
    } else if (s === "failed" || s === "failure" || s === "rejected" || s === "cancelled") {
      cls = "bg-trade-sell/10 text-trade-sell";
    } else if (s === "pending" || s === "processing" || s === "awaiting approval") {
      cls = "bg-amber-500/10 text-amber-400";
    }
    return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{status}</span>;
  };

  const filters: { key: MovementType; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All", icon: <LayoutList className="h-3 w-3 mr-1" /> },
    { key: "deposit", label: "Deposits", icon: <ArrowDownLeft className="h-3 w-3 mr-1" /> },
    { key: "withdrawal", label: "Withdrawals", icon: <ArrowUpRight className="h-3 w-3 mr-1" /> },
    { key: "transfer", label: "Transfers", icon: <ArrowLeftRight className="h-3 w-3 mr-1" /> },
    { key: "p2p", label: "P2P", icon: <Repeat className="h-3 w-3 mr-1" /> },
  ];

  if (isLoading && !dbMovements?.length) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="py-3 px-4 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Asset Movement History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => sync.mutate(true)}
              disabled={sync.isPending}
            >
              <RefreshCw className={`h-3 w-3 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Syncing..." : "Sync"}
            </Button>
            <div className="flex items-center bg-muted/50 rounded-md p-0.5">
              {filters.map((f) => (
                <Button
                  key={f.key}
                  variant="ghost"
                  size="sm"
                  className={`h-6 px-2 text-[10px] rounded-sm ${
                    filter === f.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.icon}
                  {f.label}
                </Button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">{filtered.length} records</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-accent/5">
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Time</th>
                <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Type</th>
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Asset</th>
                <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Amount</th>
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Details</th>
                <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Fee</th>
                <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-border/50 hover:bg-accent/5">
                  <td className="py-2 px-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {m.timestamp > 0 ? format(new Date(m.timestamp), "dd MMM yy HH:mm") : "—"}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {typeIcon(m.type)}
                      {typeBadge(m.type)}
                    </div>
                  </td>
                  <td className="py-2 px-3 font-medium text-foreground">{m.asset}</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    <span className={m.type === "deposit" || (m.type === "p2p" && m.details.includes("BUY")) ? "text-trade-buy" : m.type === "withdrawal" ? "text-trade-sell" : "text-foreground"}>
                      {m.type === "deposit" ? "+" : m.type === "withdrawal" ? "−" : ""}
                      {m.amount.toLocaleString("en-US", { maximumFractionDigits: 8 })}
                    </span>
                    {m.fiat && m.fiatAmount ? (
                      <div className="text-[10px] text-muted-foreground">
                        ≈ {m.fiat} {m.fiatAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground max-w-[200px]">
                    <div className="truncate">{m.details}</div>
                    {m.network && m.type !== "transfer" && (
                      <div className="text-[10px] text-muted-foreground/70">Net: {m.network}</div>
                    )}
                    {m.counterparty && (
                      <div className="text-[10px] text-muted-foreground/70">{m.counterparty}</div>
                    )}
                    {m.txId && (
                      <div className="text-[10px] text-muted-foreground/50 truncate max-w-[180px]" title={m.txId}>
                        TX: {m.txId.substring(0, 16)}…
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                    {m.fee ? `${m.fee}` : "—"}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {statusBadge(m.status)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    No movements found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
