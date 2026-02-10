import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRADING_PAIRS, useBinanceBalances, useBinanceTickerPrices, useExecuteTrade, COIN_COLORS } from "@/hooks/useBinanceAssets";
import { Loader2, ArrowDownUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function SpotTradingPanel() {
  const [selectedPair, setSelectedPair] = useState(TRADING_PAIRS[0].symbol);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: balances } = useBinanceBalances();
  const { data: prices } = useBinanceTickerPrices();
  const executeTrade = useExecuteTrade();

  const pair = TRADING_PAIRS.find((p) => p.symbol === selectedPair) || TRADING_PAIRS[0];
  const currentPrice = prices?.find((p) => p.symbol === selectedPair);
  const priceValue = currentPrice ? parseFloat(currentPrice.price) : 0;

  // Available balance for the relevant side
  const relevantAsset = side === "BUY" ? pair.quote : pair.base;
  const availableBalance = useMemo(() => {
    if (!balances) return 0;
    const b = balances.find((a) => a.asset === relevantAsset);
    return b ? b.total_free : 0;
  }, [balances, relevantAsset]);

  const estimatedResult = useMemo(() => {
    const amt = parseFloat(amount);
    if (!amt || !priceValue) return 0;
    if (side === "BUY") return amt / priceValue; // spending USDT, getting base
    return amt * priceValue; // selling base, getting USDT
  }, [amount, priceValue, side]);

  const handleExecute = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    try {
      await executeTrade.mutateAsync({
        symbol: pair.symbol,
        side,
        ...(side === "BUY"
          ? { quoteOrderQty: amount } // Spend X USDT
          : { quantity: amount }), // Sell X base
        transferAsset: relevantAsset,
      });
      setAmount("");
      setConfirmOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handlePercentage = (pct: number) => {
    const maxAmt = availableBalance * (pct / 100);
    if (side === "BUY") {
      setAmount(maxAmt.toFixed(2));
    } else {
      setAmount(maxAmt.toFixed(8));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Trading Panel */}
      <Card className="lg:col-span-2 bg-card border-border">
        <CardHeader className="py-3 px-4 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Spot Market Order</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedPair} onValueChange={setSelectedPair}>
                <SelectTrigger className="h-8 w-40 text-xs bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADING_PAIRS.map((p) => (
                    <SelectItem key={p.symbol} value={p.symbol} className="text-xs">
                      {p.base}/{p.quote}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Buy/Sell Toggle */}
          <div className="grid grid-cols-2 gap-1 bg-background rounded-lg p-1">
            <button
              className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                side === "BUY"
                  ? "bg-trade-buy text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setSide("BUY")}
            >
              Buy
            </button>
            <button
              className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                side === "SELL"
                  ? "bg-trade-sell text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setSide("SELL")}
            >
              Sell
            </button>
          </div>

          {/* Market Price */}
          <div className="bg-background rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Market Price</p>
            <p className="text-lg font-bold text-foreground tabular-nums">
              {priceValue > 0
                ? priceValue.toLocaleString("en-US", { maximumFractionDigits: 8 })
                : "Loading..."}
            </p>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                {side === "BUY" ? `Amount (${pair.quote})` : `Amount (${pair.base})`}
              </label>
              <span className="text-[10px] text-muted-foreground">
                Avbl: {availableBalance.toFixed(side === "BUY" ? 4 : 8)} {relevantAsset}
              </span>
            </div>
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 text-sm bg-background border-border pr-16 tabular-nums"
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary hover:text-primary/80"
                onClick={() => handlePercentage(100)}
              >
                Max
              </button>
            </div>

            {/* Percentage buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  className="h-7 text-[10px] text-muted-foreground bg-background hover:bg-accent/10 border border-border rounded transition-colors"
                  onClick={() => handlePercentage(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Estimated */}
          {parseFloat(amount) > 0 && priceValue > 0 && (
            <div className="bg-background rounded-lg p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Est. {side === "BUY" ? pair.base : pair.quote}
              </span>
              <span className="text-sm font-medium text-foreground tabular-nums">
                ≈ {estimatedResult.toFixed(side === "BUY" ? 8 : 2)} {side === "BUY" ? pair.base : pair.quote}
              </span>
            </div>
          )}

          {/* Funding auto-transfer note */}
          <div className="bg-accent/5 border border-border rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <ArrowDownUp className="h-3 w-3 text-primary" />
              Funds in Funding wallet will be auto-transferred to Spot before execution
            </p>
          </div>

          {/* Execute Button */}
          <Button
            className={`w-full h-11 font-semibold text-sm ${
              side === "BUY"
                ? "bg-trade-buy hover:bg-trade-buy/90 text-white"
                : "bg-trade-sell hover:bg-trade-sell/90 text-white"
            }`}
            disabled={!amount || parseFloat(amount) <= 0 || executeTrade.isPending}
            onClick={handleExecute}
          >
            {executeTrade.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {side === "BUY" ? `Buy ${pair.base}` : `Sell ${pair.base}`}
          </Button>
        </CardContent>
      </Card>

      {/* Right sidebar - Quick Balances */}
      <Card className="bg-card border-border">
        <CardHeader className="py-3 px-4 border-b border-border">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Balances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {TRADING_PAIRS.map((p) => {
              const bal = balances?.find((b) => b.asset === p.base);
              const color = COIN_COLORS[p.base] || "#888";
              return (
                <div key={p.base} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {p.base.slice(0, 2)}
                    </div>
                    <span className="text-xs text-foreground">{p.base}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {bal ? bal.total_free.toFixed(4) : "0.0000"}
                  </span>
                </div>
              );
            })}
            {/* USDT balance */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-accent/5">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white bg-[#26A17B]">
                  US
                </div>
                <span className="text-xs text-foreground font-medium">USDT</span>
              </div>
              <span className="text-xs text-foreground font-medium tabular-nums">
                {balances?.find((b) => b.asset === "USDT")?.total_free.toFixed(4) || "0.0000"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
