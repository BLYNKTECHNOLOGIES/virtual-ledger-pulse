import { useState, type ReactNode } from "react";
import { useSpotTradeHistory } from "@/hooks/useBinanceAssets";
import { useSpotTradeSync } from "@/hooks/useSpotTradeSync";
import { useExchangeAccount } from "@/contexts/ExchangeAccountContext";
import { Monitor, Smartphone, LayoutList, RefreshCw, History } from "lucide-react";
import { format } from "date-fns";
import { PanelState, FILTER_COUNT, SEG_WRAP, ShimmerRows, SideChip, StatusChip, TH, segBtn } from "./assetUi";
import { fmt2, fmtPrice, fmtQty, humanStatus, splitPair } from "./assetFormat";

type SourceFilter = "all" | "terminal" | "binance_app";

function SourceChip({ source, account }: { source: string; account?: string | null }) {
  const terminal = source === "terminal";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
    {account && <span className="text-[10px] text-muted-foreground">{account}</span>}
    <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[10px] font-medium ${terminal ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
      {terminal ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
      {terminal ? "Terminal" : "Binance"}
    </span>
    </span>
  );
}

export function TradeHistory() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const { data: trades, isLoading } = useSpotTradeHistory();
  // F5b — in All accounts, label each row with its account.
  const { isAllAccounts, visibleAccounts } = useExchangeAccount();
  const acctLabel = (t: any) => !isAllAccounts ? null
    : t.exchange_account_id ? (visibleAccounts.find((a) => a.id === t.exchange_account_id)?.account_name || "Other account") : "Account unknown";

  // Trigger background sync of Binance spot trades
  const { manualSync, isManuallySyncing } = useSpotTradeSync();

  // Deduplicate trades with same binance_order_id (Terminal + Binance sync create two entries)
  // Prefer the binance_app record (has commission data)
  const deduplicatedTrades = (() => {
    if (!trades) return [];
    const orderMap = new Map<string, any>();
    for (const trade of trades) {
      const key = trade.binance_order_id ? `${trade.exchange_account_id || ""}|${trade.binance_order_id}` : trade.id;
      const existing = orderMap.get(key);
      if (!existing) {
        orderMap.set(key, { ...trade });
      } else {
        // Aggregate partial fills: sum qty, quote, commission
        existing.quantity = parseFloat(String(existing.quantity || 0)) + parseFloat(String(trade.quantity || 0));
        existing.quote_quantity = parseFloat(String(existing.quote_quantity || 0)) + parseFloat(String(trade.quote_quantity || 0));
        existing.commission = parseFloat(String(existing.commission || 0)) + parseFloat(String(trade.commission || 0));
        // Use weighted avg price: total_quote / total_qty
        if (existing.quantity > 0) {
          existing.executed_price = existing.quote_quantity / existing.quantity;
        }
        // Prefer binance_app source for metadata
        if (trade.source === "binance_app" && existing.source === "terminal") {
          existing.source = trade.source;
          existing.commission_asset = trade.commission_asset;
        }
      }
    }
    return Array.from(orderMap.values()).sort((a, b) => {
      const timeA = a.trade_time ? Number(a.trade_time) : new Date(a.created_at).getTime();
      const timeB = b.trade_time ? Number(b.trade_time) : new Date(b.created_at).getTime();
      return timeB - timeA;
    });
  })();

  const filteredTrades = deduplicatedTrades.filter((trade: any) => {
    if (sourceFilter === "all") return true;
    return trade.source === sourceFilter;
  });

  const counts = {
    all: deduplicatedTrades.length,
    terminal: deduplicatedTrades.filter((t: any) => t.source === "terminal").length,
    binance_app: deduplicatedTrades.filter((t: any) => t.source === "binance_app").length,
  };
  const filters: { key: SourceFilter; label: string; icon: ReactNode }[] = [
    { key: "all", label: "All", icon: <LayoutList className="h-3 w-3" /> },
    { key: "terminal", label: "Terminal", icon: <Monitor className="h-3 w-3" /> },
    { key: "binance_app", label: "Binance App", icon: <Smartphone className="h-3 w-3" /> },
  ];

  const view = (trade: any) => {
    const tradeDate = trade.trade_time ? new Date(Number(trade.trade_time)) : new Date(trade.created_at);
    const split = splitPair(trade.symbol);
    const base = trade.base_asset || split.base;
    const quote = trade.quote_asset || split.quote;
    // A Terminal BUY that never filled still holds the amount it tried to spend (quote coin), not a coin quantity.
    const unfilledBuy = trade.source === "terminal" && trade.side === "BUY" && (trade.status === "FAILED" || trade.status === "PENDING");
    return {
      time: format(tradeDate, "dd MMM HH:mm"),
      pair: quote ? `${base}/${quote}` : String(trade.symbol || ""),
      base,
      quote,
      qtyUnit: unfilledBuy ? quote : base,
      qty: fmtQty(trade.quantity || 0, 8),
      price: trade.executed_price ? fmtPrice(trade.executed_price) : "—",
      total: trade.quote_quantity ? fmt2(trade.quote_quantity) : "—",
      fee: trade.commission ? `${fmtQty(trade.commission, 8)} ${trade.commission_asset || ""}`.trim() : "—",
      status: humanStatus(trade.status),
      error: trade.status === "FAILED" ? trade.error_message || null : null,
    };
  };

  return (
    <section className="t-panel overflow-hidden @container" aria-label="Spot trade log">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="t-panel-head-title">Spot Trade Log</span>
        {!isLoading && (
        <>
        <span className="t-mono text-[10px] text-muted-foreground">{filteredTrades?.length || 0} records</span>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <div className={`${SEG_WRAP} max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`} role="group" aria-label="Source">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={segBtn(sourceFilter === f.key)}
                aria-pressed={sourceFilter === f.key}
                onClick={() => setSourceFilter(f.key)}
              >
                {f.icon}
                {f.label}
                <span className={FILTER_COUNT}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={manualSync}
            disabled={isManuallySyncing}
            title="Fetch new spot trades from Binance"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isManuallySyncing ? "animate-spin" : ""}`} />
            {isManuallySyncing ? "Syncing..." : "Sync"}
          </button>
        </div>
        </>
        )}
      </div>

      {isLoading ? (
        <ShimmerRows label="Loading spot trades…" />
      ) : filteredTrades.length === 0 ? (
        <PanelState icon={<History className="h-5 w-5" />} title="No trades found" hint={sourceFilter === "all" ? "Spot trades appear here after the next sync." : "No trades from this source in the loaded history."} />
      ) : (
        <>
          {/* Cards — narrow work areas */}
          <ul className="divide-y divide-border @[44rem]:hidden">
            {filteredTrades.map((trade: any) => {
              const v = view(trade);
              return (
                <li key={trade.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{v.pair}</span>
                    <SideChip side={trade.side} />
                    <span className="ml-auto"><StatusChip label={v.status} title={v.error ?? undefined} /></span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="t-mono tabular-nums text-foreground">{v.qty} <span className="text-muted-foreground">{v.qtyUnit}</span></span>
                    <span className="t-mono tabular-nums text-foreground">{v.total}{v.total !== "—" && v.quote ? <span className="text-muted-foreground"> {v.quote}</span> : null}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span className="t-mono tabular-nums">{v.time}</span>
                    {v.price !== "—" ? <span className="t-mono tabular-nums">@ {v.price}</span> : <span />}
                    <SourceChip source={trade.source} account={acctLabel(trade)} />
                  </div>
                  {v.fee !== "—" && <p className="t-mono text-[11px] tabular-nums text-muted-foreground">Fee {v.fee}</p>}
                  {v.error && <p className="break-words text-[11px] text-trade-sell">{v.error}</p>}
                </li>
              );
            })}
          </ul>

          {/* Table — wider work areas */}
          <div className="hidden overflow-x-auto @[44rem]:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${TH} pl-4`}>Time</th>
                  <th className={TH}>Pair</th>
                  <th className={TH}>Side</th>
                  <th className={`${TH} text-right`}>Qty</th>
                  <th className={`${TH} text-right`}>Avg price</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={`${TH} hidden text-right @[60rem]:table-cell`}>Fee</th>
                  <th className={`${TH} hidden text-center @[52rem]:table-cell`}>Source</th>
                  <th className={`${TH} pr-4 text-center`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade: any) => {
                  const v = view(trade);
                  return (
                    <tr key={trade.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-accent/5">
                      <td className="whitespace-nowrap py-2 pl-4 pr-3 t-mono tabular-nums text-muted-foreground">{v.time}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{v.pair}</span>
                        {v.error && <p className="line-clamp-2 max-w-[16rem] break-words text-[10px] text-trade-sell" title={v.error}>{v.error}</p>}
                      </td>
                      <td className="px-3 py-2"><SideChip side={trade.side} /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-right t-mono tabular-nums text-foreground">
                        {v.qty} <span className="text-muted-foreground">{v.qtyUnit}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right t-mono tabular-nums text-foreground">{v.price}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right t-mono tabular-nums text-foreground">
                        {v.total}{v.total !== "—" && v.quote ? <span className="text-muted-foreground"> {v.quote}</span> : null}
                        {v.fee !== "—" && <div className="text-[10px] text-muted-foreground @[60rem]:hidden">Fee {v.fee}</div>}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-right t-mono tabular-nums text-muted-foreground @[60rem]:table-cell">{v.fee}</td>
                      <td className="hidden px-3 py-2 text-center @[52rem]:table-cell"><SourceChip source={trade.source} account={acctLabel(trade)} /></td>
                      <td className="py-2 pl-3 pr-4 text-center">
                        <StatusChip label={v.status} title={v.error ?? undefined} />
                        <div className="mt-1 @[52rem]:hidden"><SourceChip source={trade.source} account={acctLabel(trade)} /></div>
                      </td>
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
