import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRADING_PAIRS, assetPageSymbols, useAccountBalances, useBinanceTickerPrices, useExecuteTrade, useSymbolRules } from "@/hooks/useBinanceAssets";
import { useExchangeAccount } from "@/contexts/ExchangeAccountContext";
import { Loader2, ArrowDownUp, AlertTriangle, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CoinAvatar } from "./assetUi";
import { fmt2, fmtPrice, fmtQty } from "./assetFormat";
import { checkOrder, computeFundingShortfall, fromUnits, percentOfAvailable, toUnits } from "./tradeRules";

export function SpotTradingPanel() {
  const [selectedPair, setSelectedPair] = useState(TRADING_PAIRS[0].symbol);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [buyConfirmPending, setBuyConfirmPending] = useState(false);
  const [sellConfirmPending, setSellConfirmPending] = useState(false);

  const executeTrade = useExecuteTrade();
  const { activeAccount, isAllAccounts, visibleAccounts } = useExchangeAccount();
  // F5 — orders run on an explicitly chosen account. Single-account view: that account.
  // All accounts view: a picker, defaulting to the default account.
  const defaultAccount = visibleAccounts.find((a) => a.is_default) ?? visibleAccounts[0] ?? null;
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(null);
  const tradeAccount = activeAccount
    ?? visibleAccounts.find((a) => a.id === pickedAccountId)
    ?? defaultAccount;
  const tradeAccountId = tradeAccount?.id ?? null;

  const { data: balances } = useAccountBalances(tradeAccountId);
  const { data: rulesMap, error: rulesError } = useSymbolRules();
  const balanceList = Array.isArray(balances) ? balances : [];
  const { data: prices } = useBinanceTickerPrices(assetPageSymbols([]));
  const priceList = Array.isArray(prices) ? prices : [];

  const pair = TRADING_PAIRS.find((p) => p.symbol === selectedPair) || TRADING_PAIRS[0];
  const rules = rulesMap?.[pair.symbol] ?? null;
  const currentPrice = priceList.find((p) => p.symbol === selectedPair);
  const priceValue = currentPrice ? parseFloat(currentPrice.price) : 0;

  // Available balance for the relevant side — the trading account's own Funding + Spot.
  const relevantAsset = side === "BUY" ? pair.quote : pair.base;
  const relevantBal = balanceList.find((a) => a.asset === relevantAsset);
  const availableStr = relevantBal
    ? fromUnits(toUnits(relevantBal.funding_free) + toUnits(relevantBal.spot_free))
    : "0";
  const availableBalance = Number(availableStr);

  const estimatedResult = useMemo(() => {
    const amt = parseFloat(amount);
    if (!amt || !priceValue) return 0;
    if (side === "BUY") return amt / priceValue; // spending USDT, getting base
    return amt * priceValue; // selling base, getting USDT
  }, [amount, priceValue, side]);

  // F3 — same checks as the edge function, with Binance's live rules.
  const check = useMemo(() => {
    if (!amount) return null;
    if (!rules) return { ok: false, message: rulesError ? "Couldn't load Binance's trading rules — try again shortly." : "Loading Binance's trading rules…" };
    return checkOrder({ side, amount, available: availableStr, price: currentPrice?.price ?? "0", rules, accountName: tradeAccount?.account_name });
  }, [amount, rules, rulesError, side, availableStr, currentPrice?.price, tradeAccount?.account_name]);

  // F1 — what will move from Funding (shown in the confirm dialog).
  const fundingMove = useMemo(() => {
    if (!check?.ok || !relevantBal) return null;
    const need = side === "BUY" ? check.quoteOrderQty! : check.quantity!;
    return computeFundingShortfall(need, relevantBal.spot_free, relevantBal.funding_free, relevantAsset);
  }, [check, relevantBal, side, relevantAsset]);

  const handleExecute = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    if (!check?.ok || !tradeAccountId) {
      toast.error(check?.message || "Choose the account for this order");
      return;
    }
    try {
      await executeTrade.mutateAsync({
        symbol: pair.symbol,
        side,
        ...(side === "BUY"
          ? { quoteOrderQty: check.quoteOrderQty } // Spend X USDT
          : { quantity: check.quantity }), // Sell X base, floored to Binance's step
        transferAsset: relevantAsset,
        exchangeAccountId: tradeAccountId,
      });
      setAmount("");
      setConfirmOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handlePercentage = (pct: number) => {
    // Always rounds DOWN: SELL to Binance's step, BUY to the quote precision.
    setAmount(percentOfAvailable(availableStr, pct, side, rules));
  };

  const isBuy = side === "BUY";
  const receiveAsset = isBuy ? pair.base : pair.quote;
  const sideBtn = (s: "BUY" | "SELL") =>
    `h-8 rounded-md text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      side === s
        ? s === "BUY"
          ? "bg-trade-buy text-primary-foreground shadow-sm"
          : "bg-trade-sell text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
    }`;
  const quick = [{ base: "USDT" }, ...TRADING_PAIRS.map((p) => ({ base: p.base }))];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Trading Panel */}
      <section className="t-panel overflow-hidden lg:col-span-2" aria-label="Spot market order">
        <div className="flex min-h-[2.75rem] flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5">
          <p role="heading" aria-level={2} className="text-sm font-medium text-foreground">Spot Market Order</p>
          {isAllAccounts && visibleAccounts.length > 1 ? (
            <Select value={tradeAccountId ?? undefined} onValueChange={setPickedAccountId}>
              <SelectTrigger className="h-8 w-44 text-xs bg-background border-border" aria-label="Account for this order">
                <SelectValue placeholder="Choose account" />
              </SelectTrigger>
              <SelectContent>
                {visibleAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">{a.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : tradeAccount && (
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">
              on <span className="text-foreground">{tradeAccount.account_name}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Select value={selectedPair} onValueChange={setSelectedPair}>
              <SelectTrigger className="h-8 w-40 text-xs bg-background border-border" aria-label="Trading pair">
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

        <div className="space-y-4 p-4">
          {/* Buy/Sell Toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/30 p-1" role="group" aria-label="Order side">
            <button type="button" className={sideBtn("BUY")} aria-pressed={isBuy} onClick={() => setSide("BUY")}>
              Buy
            </button>
            <button type="button" className={sideBtn("SELL")} aria-pressed={!isBuy} onClick={() => setSide("SELL")}>
              Sell
            </button>
          </div>

          {/* Market Price */}
          <div className="flex items-end justify-between gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Market Price</p>
              <p className="t-mono text-lg font-semibold tabular-nums text-foreground">
                {priceValue > 0
                  ? priceValue.toLocaleString("en-US", { maximumFractionDigits: 8 })
                  : "Loading..."}
              </p>
            </div>
            <span className="pb-1 text-xs text-muted-foreground">
              {pair.base}/{pair.quote}
            </span>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <label htmlFor="spot-order-amount" className="text-xs font-medium text-foreground">
                {isBuy ? `Amount to spend (${pair.quote})` : `Amount to sell (${pair.base})`}
              </label>
              <span className="text-[11px] text-muted-foreground">
                Available{" "}
                <span className="t-mono tabular-nums text-foreground">
                  {availableBalance.toLocaleString("en-US", { maximumFractionDigits: 8 })}
                </span>{" "}
                {relevantAsset}
              </span>
            </div>
            <div className="relative">
              <Input
                id="spot-order-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 text-sm bg-background border-border pr-28 t-mono tabular-nums"
              />
              <div className="absolute inset-y-0 right-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground" aria-hidden="true">{relevantAsset}</span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handlePercentage(100)}
                >
                  Max
                </button>
              </div>
            </div>

            {/* Percentage buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="h-7 rounded-md border border-border bg-transparent text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handlePercentage(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {check && !check.ok && (
            <p role="status" aria-live="polite" className="flex items-start gap-1.5 text-[11px] leading-relaxed text-destructive">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              {check.message}
            </p>
          )}

          {/* Estimated */}
          {parseFloat(amount) > 0 && priceValue > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">You receive (est.)</span>
              <span className="t-mono text-sm font-medium tabular-nums text-foreground">
                ≈ {isBuy ? fmtQty(estimatedResult, 8) : fmt2(estimatedResult)} {receiveAsset}
              </span>
            </div>
          )}

          {/* Funding auto-transfer note */}
          <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2">
            <ArrowDownUp className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Before the order runs, only the {relevantAsset} that Spot is missing is moved from Funding to Spot. Proceeds stay in Spot.
            </p>
          </div>

          {isAllAccounts && tradeAccount && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
              <Layers className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-[11px] leading-relaxed text-warning">
                All accounts view: this order is placed on {tradeAccount.account_name}; Available, Max and % use that account's balance only.
              </p>
            </div>
          )}

          {/* Execute Button */}
          <Button
            className={`w-full h-11 font-semibold text-sm ${
              isBuy
                ? "bg-trade-buy hover:bg-trade-buy/90 text-primary-foreground"
                : "bg-trade-sell hover:bg-trade-sell/90 text-primary-foreground"
            }`}
            disabled={!check?.ok || !tradeAccountId || executeTrade.isPending}
            onClick={() => {
              if (!check?.ok) return;
              if (side === "BUY") setBuyConfirmPending(true);
              else setSellConfirmPending(true);
            }}
          >
            {executeTrade.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {side === "BUY" ? `Buy ${pair.base}` : `Sell ${pair.base}`}
          </Button>

          {/* Buy Confirmation Dialog */}
          <AlertDialog open={buyConfirmPending} onOpenChange={setBuyConfirmPending}>
            <AlertDialogContent className="bg-card border-border max-w-sm t-scale-in">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Confirm Buy Order
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      You are about to place a <strong className="text-trade-buy">BUY</strong> market order:
                    </p>
                    <dl className="space-y-1.5 rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt>Pair</dt>
                        <dd className="font-medium text-foreground">{pair.base}/{pair.quote}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Spend</dt>
                        <dd className="t-mono font-medium tabular-nums text-foreground">{fmtQty(check?.quoteOrderQty || amount || "0", 8)} {pair.quote}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Est. Receive</dt>
                        <dd className="t-mono font-medium tabular-nums text-foreground">≈ {fmtQty(estimatedResult, 8)} {pair.base}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Price</dt>
                        <dd className="t-mono font-medium tabular-nums text-foreground">{fmtPrice(priceValue)}</dd>
                      </div>
                      {tradeAccount && (
                        <div className="flex justify-between gap-3">
                          <dt>Account</dt>
                          <dd className="font-medium text-foreground">{tradeAccount.account_name}</dd>
                        </div>
                      )}
                      {fundingMove?.ok && (
                        <div className="flex justify-between gap-3">
                          <dt>From Funding</dt>
                          <dd className="t-mono font-medium tabular-nums text-foreground">{Number(fundingMove.move) > 0 ? `${fmtQty(fundingMove.move, 8)} ${relevantAsset}` : "Nothing (Spot has enough)"}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="text-[11px]">Are you sure you want to proceed?</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-trade-buy hover:bg-trade-buy/90 text-primary-foreground text-xs"
                  onClick={() => {
                    setBuyConfirmPending(false);
                    handleExecute();
                  }}
                >
                  Confirm Buy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Sell Confirmation Dialog */}
          <AlertDialog open={sellConfirmPending} onOpenChange={setSellConfirmPending}>
            <AlertDialogContent className="bg-card border-border max-w-sm t-scale-in">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Confirm Sell Order
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      You are about to place a <strong className="text-trade-sell">SELL</strong> market order:
                    </p>
                    <dl className="space-y-1.5 rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt>Pair</dt>
                        <dd className="font-medium text-foreground">{pair.base}/{pair.quote}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Quantity to sell</dt>
                        <dd className="t-mono font-medium tabular-nums text-foreground">{fmtQty(check?.quantity || "0", 8)} {pair.base}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Est. Receive</dt>
                        <dd className="t-mono font-medium tabular-nums text-foreground">≈ {fmt2(Number(check?.quantity || 0) * priceValue)} {pair.quote}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Price</dt>
                        <dd className="t-mono font-medium tabular-nums text-foreground">{fmtPrice(priceValue)}</dd>
                      </div>
                      {tradeAccount && (
                        <div className="flex justify-between gap-3">
                          <dt>Account</dt>
                          <dd className="font-medium text-foreground">{tradeAccount.account_name}</dd>
                        </div>
                      )}
                      {fundingMove?.ok && (
                        <div className="flex justify-between gap-3">
                          <dt>From Funding</dt>
                          <dd className="t-mono font-medium tabular-nums text-foreground">{Number(fundingMove.move) > 0 ? `${fmtQty(fundingMove.move, 8)} ${relevantAsset}` : "Nothing (Spot has enough)"}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="text-[11px]">Are you sure you want to proceed?</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-trade-sell hover:bg-trade-sell/90 text-primary-foreground text-xs"
                  onClick={() => {
                    setSellConfirmPending(false);
                    handleExecute();
                  }}
                >
                  Confirm Sell
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      {/* Right sidebar - Quick Balances */}
      <section className="t-panel overflow-hidden self-start" aria-label="Quick balances">
        <div className="t-panel-head">
          <span className="t-panel-head-title">Quick Balances</span>
          <span className="ml-auto text-[10px] text-muted-foreground">available</span>
        </div>
        <ul className="divide-y divide-border">
          {quick.map(({ base }) => {
            const bal = balanceList.find((b) => b.asset === base);
            const free = bal ? bal.total_free : 0;
            const inPair = base === pair.base || base === pair.quote;
            return (
              <li key={base} className={`flex items-center justify-between gap-3 px-4 py-2 ${inPair ? "bg-primary/5" : ""}`}>
                <span className="flex items-center gap-2">
                  <CoinAvatar asset={base} size="xs" />
                  <span className={`text-xs ${inPair ? "font-medium text-foreground" : "text-foreground"}`}>{base}</span>
                </span>
                <span className={`t-mono text-xs tabular-nums ${free > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {fmtQty(free, 8)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
