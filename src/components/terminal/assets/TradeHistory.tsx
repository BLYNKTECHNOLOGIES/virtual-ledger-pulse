import { useSpotTradeHistory } from "@/hooks/useBinanceAssets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export function TradeHistory() {
  const { data: trades, isLoading } = useSpotTradeHistory();

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
            Internal Trade Log
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">{trades?.length || 0} records</span>
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
                <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades?.map((trade: any) => (
                <tr key={trade.id} className="border-b border-border/50 hover:bg-accent/5">
                  <td className="py-2 px-3 text-muted-foreground tabular-nums">
                    {format(new Date(trade.created_at), "dd MMM HH:mm")}
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
              ))}
              {(!trades || trades.length === 0) && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    No trades executed yet
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
