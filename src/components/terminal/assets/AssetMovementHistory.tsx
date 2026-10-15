import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Repeat, LayoutList, RefreshCw, Copy, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CoinAvatar, PanelState, FILTER_COUNT, SEG_WRAP, ShimmerRows, StatusChip, TH, segBtn } from "./assetUi";
import { fmtQty, humanStatus, shortHash } from "./assetFormat";

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
  "2": "Rejected",
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

const TYPE_META: Record<Exclude<MovementType, "all">, { label: string; chip: string; icon: ReactNode }> = {
  deposit: { label: "Deposit", chip: "bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy", icon: <ArrowDownLeft className="h-3 w-3" /> },
  withdrawal: { label: "Withdrawal", chip: "bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell", icon: <ArrowUpRight className="h-3 w-3" /> },
  transfer: { label: "Transfer", chip: "bg-primary/10 text-primary", icon: <ArrowLeftRight className="h-3 w-3" /> },
  p2p: { label: "P2P", chip: "bg-warning/10 text-warning", icon: <Repeat className="h-3 w-3" /> },
};

function TypeChip({ type }: { type: MovementType }) {
  const m = TYPE_META[type as Exclude<MovementType, "all">];
  if (!m) return <span className="text-[10px] text-muted-foreground">{type}</span>;
  return (
    <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[10px] font-medium ${m.chip}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

function copyText(value: string, what: string) {
  if (!navigator.clipboard?.writeText) {
    toast.error("Couldn't copy: clipboard not available in this browser");
    return;
  }
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${what} copied`),
    () => toast.error("Couldn't copy"),
  );
}

function HashLine({ hash }: { hash: { label: string; value: string } }) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
      <span className="truncate t-mono" title={hash.value}>
        {hash.label}: {hash.label === "Pay ID" ? hash.value : shortHash(hash.value)}
      </span>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => copyText(hash.value, hash.label === "Pay ID" ? "Pay ID" : "Transaction ID")}
        aria-label={hash.label === "Pay ID" ? "Copy Pay ID" : "Copy transaction ID"}
        title="Copy"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
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
        const isBinancePay = m.network === "Binance Pay";
        let statusLabel = m.status || "";
        if (mType === "deposit") statusLabel = isBinancePay ? "Completed" : (DEPOSIT_STATUS[m.status || ""] || m.status || "");
        if (mType === "withdrawal") statusLabel = isBinancePay ? "Completed" : (WITHDRAW_STATUS[m.status || ""] || m.status || "");

        let details = "";
        if (isBinancePay) {
          details = mType === "withdrawal" ? "Binance Pay Sent" : "Binance Pay Received";
        } else if (mType === "deposit") {
          details = `${m.network || ""} Deposit`;
        } else if (mType === "withdrawal") {
          details = `${m.network || ""} Withdrawal`;
        } else if (mType === "transfer") {
          details = m.transfer_direction || "Internal Transfer";
        }

        movements.push({
          id: m.id,
          type: mType,
          asset: m.asset || "",
          amount: Number(m.amount) || 0,
          status: statusLabel,
          timestamp: Number(m.movement_time) || 0,
          details,
          network: isBinancePay ? "Binance Pay" : (m.network || undefined),
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

  const filters: { key: MovementType; label: string; icon: ReactNode }[] = [
    { key: "all", label: "All", icon: <LayoutList className="h-3 w-3" /> },
    { key: "deposit", label: "Deposits", icon: <ArrowDownLeft className="h-3 w-3" /> },
    { key: "withdrawal", label: "Withdrawals", icon: <ArrowUpRight className="h-3 w-3" /> },
    { key: "transfer", label: "Transfers", icon: <ArrowLeftRight className="h-3 w-3" /> },
    { key: "p2p", label: "P2P", icon: <Repeat className="h-3 w-3" /> },
  ];
  const countOf = (k: MovementType) => (k === "all" ? unified.length : unified.filter((m) => m.type === k).length);

  /** Display pieces for one movement (presentation only). */
  const view = (m: UnifiedMovement) => {
    const inflow = m.type === "deposit" || (m.type === "p2p" && m.details.includes("BUY"));
    const outflow = m.type === "withdrawal" || (m.type === "p2p" && m.details.includes("SELL"));
    const isPay = m.network === "Binance Pay";
    return {
      time: m.timestamp > 0 ? format(new Date(m.timestamp), "dd MMM yy HH:mm") : "—",
      amount: `${inflow ? "+" : outflow ? "−" : ""}${m.amount.toLocaleString("en-US", { maximumFractionDigits: 8 })}`,
      amountClass: inflow ? "text-trade-buy" : outflow ? "text-trade-sell" : "text-foreground",
      fiat: m.fiat && m.fiatAmount ? `≈ ${m.fiat} ${m.fiatAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null,
      fee: m.fee ? `${fmtQty(m.fee, 8)} ${m.asset}`.trim() : "—",
      status: humanStatus(m.status),
      sub: [
        isPay && m.address ? `To/From: ${m.address}` : null,
        m.network && !isPay && m.type !== "transfer" ? `Network: ${m.network}` : null,
        m.counterparty || null,
      ].filter(Boolean) as string[],
      hash: m.txId ? { label: isPay ? "Pay ID" : "TX", value: m.txId } : null,
    };
  };

  if (isLoading && !dbMovements?.length) {
    return (
      <div className="t-panel overflow-hidden">
        <ShimmerRows label="Loading asset movements…" />
      </div>
    );
  }

  return (
    <section className="t-panel overflow-hidden @container" aria-label="Asset movement history">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="t-panel-head-title">Asset Movement History</span>
        <span className="t-mono text-[10px] text-muted-foreground">{filtered.length} records</span>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <div className={`${SEG_WRAP} max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`} role="group" aria-label="Movement type">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={segBtn(filter === f.key)}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.icon}
                {f.label}
                <span className={FILTER_COUNT}>{countOf(f.key)}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => sync.mutate(true)}
            disabled={sync.isPending}
            title="Fetch new deposits, withdrawals and transfers from Binance"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <PanelState icon={<ScrollText className="h-5 w-5" />} title="No movements found" hint={filter === "all" ? "Deposits, withdrawals, transfers and P2P trades appear here after a sync." : "Nothing of this type in the loaded history."} />
      ) : (
        <>
          {/* Cards — narrow work areas */}
          <ul className="divide-y divide-border @[48rem]:hidden">
            {filtered.map((m) => {
              const v = view(m);
              return (
                <li key={m.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <TypeChip type={m.type} />
                    <span className="t-mono text-[11px] tabular-nums text-muted-foreground">{v.time}</span>
                    <span className="ml-auto"><StatusChip label={v.status} /></span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <CoinAvatar asset={m.asset} size="xs" />
                      <span className="truncate text-xs text-foreground">{m.details}</span>
                    </span>
                    <span className="text-right">
                      <span className={`t-mono text-sm tabular-nums ${v.amountClass}`}>{v.amount} <span className="text-[11px] text-muted-foreground">{m.asset}</span></span>
                      {v.fiat && <span className="block t-mono text-[10px] tabular-nums text-muted-foreground">{v.fiat}</span>}
                    </span>
                  </div>
                  {(v.sub.length > 0 || v.fee !== "—") && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {v.sub.map((s) => <span key={s} className="truncate">{s}</span>)}
                      {v.fee !== "—" && <span className="t-mono">Fee {v.fee}</span>}
                    </div>
                  )}
                  {v.hash && <HashLine hash={v.hash} />}
                </li>
              );
            })}
          </ul>

          {/* Table — wider work areas */}
          <div className="hidden overflow-x-auto @[48rem]:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${TH} pl-4`}>Time</th>
                  <th className={TH}>Type</th>
                  <th className={TH}>Asset</th>
                  <th className={`${TH} text-right`}>Amount</th>
                  <th className={TH}>Details</th>
                  <th className={`${TH} text-right`}>Fee</th>
                  <th className={`${TH} pr-4 text-center`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const v = view(m);
                  return (
                    <tr key={m.id} className="border-b border-border/50 align-top transition-colors last:border-0 hover:bg-accent/5">
                      <td className="whitespace-nowrap py-2.5 pl-4 pr-3 t-mono tabular-nums text-muted-foreground">{v.time}</td>
                      <td className="px-3 py-2.5"><TypeChip type={m.type} /></td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <CoinAvatar asset={m.asset} size="xs" />
                          <span className="font-medium text-foreground">{m.asset}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right t-mono tabular-nums">
                        <span className={v.amountClass}>{v.amount}</span>
                        {v.fiat && <div className="text-[10px] text-muted-foreground">{v.fiat}</div>}
                      </td>
                      <td className="max-w-[18rem] px-3 py-2.5 text-muted-foreground">
                        <div className="truncate text-foreground">{m.details}</div>
                        {v.sub.map((s) => <div key={s} className="truncate text-[10px]">{s}</div>)}
                        {v.hash && <HashLine hash={v.hash} />}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right t-mono tabular-nums text-muted-foreground">{v.fee}</td>
                      <td className="py-2.5 pl-3 pr-4 text-center"><StatusChip label={v.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
