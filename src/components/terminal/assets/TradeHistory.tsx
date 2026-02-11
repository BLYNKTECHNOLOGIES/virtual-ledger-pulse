import { useState } from "react";
import { useSpotTradeHistory } from "@/hooks/useBinanceAssets";
import { useSpotTradeSync } from "@/hooks/useSpotTradeSync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, Smartphone, LayoutList } from "lucide-react";
import { format } from "date-fns";

type SourceFilter = "all" | "terminal" | "binance_app";

export function TradeHistory() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const { data: trades, isLoading } = useSpotTradeHistory();

  // Trigger background sync of Binance spot trades
  useSpotTradeSync();

  const filteredTrades = trades?.filter((trade: any) => {
    if (sourceFilter === "all") return true;
    return trade.source === sourceFilter;
  });

  if (isLoading) {
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
            Spot Trade Log
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/50 rounded-md p-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-sm ${
                  sourceFilter === "all" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSourceFilter("all")}
              >
                <LayoutList className="h-3 w-3 mr-1" />
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-sm ${
                  sourceFilter === "terminal" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSourceFilter("terminal")}
              >
                <Monitor className="h-3 w-3 mr-1" />
                Terminal
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-sm ${
                  sourceFilter === "binance_app" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSourceFilter("binance_app")}
              >
                <Smartphone className="h-3 w-3 mr-1" />
                Binance App
              </Button>
            </div>
            <span className="text-[10px] text-muted-foreground">{filteredTrades?.length || 0} records</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-accent/5">
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Time</th>
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Pair</th>
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Side</th>
                <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Qty</th>
                <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Price</th>
                <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Total</th>
                <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Fee</th>
                <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Source</th>
                <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades?.map((trade: any) => {
                const tradeDate = trade.trade_time 
                  ? new Date(Number(trade.trade_time))
                  : new Date(trade.created_at);
                return (
                  <tr key={trade.id} className="border-b border-border/50 hover:bg-accent/5">
                    <td className="py-2 px-3 text-muted-foreground tabular-nums">
                      {format(tradeDate, "dd MMM HH:mm")}
                    </td>
                    <td className="py-2 px-3 font-medium text-foreground">{trade.symbol}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          trade.side === "BUY"
                            ? "bg-trade-buy/10 text-trade-buy"
                            : "bg-trade-sell/10 text-trade-sell"
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-foreground tabular-nums">
                      {parseFloat(trade.quantity || 0).toFixed(8)}
                    </td>
                    <td className="py-2 px-3 text-right text-foreground tabular-nums">
                      {trade.executed_price
                        ? parseFloat(trade.executed_price).toLocaleString("en-US", { maximumFractionDigits: 4 })
                        : "—"}
                    </td>
                    <td className="py-2 px-3 text-right text-foreground tabular-nums">
                      {trade.quote_quantity
                        ? parseFloat(trade.quote_quantity).toFixed(2)
                        : "—"}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                      {trade.commission
                        ? `${parseFloat(trade.commission).toFixed(6)} ${trade.commission_asset || ""}`
                        : "—"}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          trade.source === "terminal"
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {trade.source === "terminal" ? "Terminal" : "Binance"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          trade.status === "FILLED"
                            ? "bg-trade-buy/10 text-trade-buy"
                            : trade.status === "FAILED"
                            ? "bg-trade-sell/10 text-trade-sell"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(!filteredTrades || filteredTrades.length === 0) && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    No trades found
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
