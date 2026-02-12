
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateConversion } from "@/hooks/useProductConversions";
import { useAssetPosition } from "@/hooks/useWalletAssetPositions";
import { ArrowRightLeft, Calculator, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const ASSET_OPTIONS = [
  { code: "BTC", name: "Bitcoin" },
  { code: "ETH", name: "Ethereum" },
  { code: "BNB", name: "BNB" },
  { code: "XRP", name: "XRP" },
  { code: "SOL", name: "Solana" },
  { code: "DOGE", name: "Dogecoin" },
  { code: "TRX", name: "TRON" },
  { code: "PEPE", name: "PEPE" },
  { code: "SHIB", name: "SHIB" },
];

export function CreateConversionForm() {
  const [walletId, setWalletId] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [assetCode, setAssetCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [feePercentage, setFeePercentage] = useState("");
  // WAC optional fields
  const [localPrice, setLocalPrice] = useState("");
  const [fxRateToUsdt, setFxRateToUsdt] = useState("");
  const [marketRateSnapshot, setMarketRateSnapshot] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createMutation = useCreateConversion();

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name')
        .eq('is_active', true)
        .order('wallet_name');
      if (error) throw error;
      return data || [];
    },
  });

  // WAC position for selected wallet+asset
  const { data: position } = useAssetPosition(walletId || undefined, assetCode || undefined);

  // Auto-derive execution rate from local price + fx rate
  const derivedExecRate = useMemo(() => {
    const lp = parseFloat(localPrice);
    const fx = parseFloat(fxRateToUsdt);
    if (lp > 0 && fx > 0) return lp / fx;
    return null;
  }, [localPrice, fxRateToUsdt]);

  // Use derived rate or manual price
  const effectiveRate = derivedExecRate ?? (parseFloat(priceUsd) || 0);

  const calc = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const price = effectiveRate;
    const feePct = parseFloat(feePercentage) || 0;
    const grossUsd = qty * price;
    const feeAmt = side === 'BUY'
      ? (feePct / 100) * qty
      : (feePct / 100) * grossUsd;
    const feeAsset = side === 'BUY' ? assetCode : 'USDT';
    const netAsset = side === 'BUY' ? qty - feeAmt : qty;
    const netUsdt = side === 'BUY' ? grossUsd : grossUsd - feeAmt;

    // SELL P&L estimate using current WAC position
    let estCostOut = 0;
    let estPnl = 0;
    if (side === 'SELL' && position && Number(position.avg_cost_usdt) > 0) {
      estCostOut = qty * Number(position.avg_cost_usdt);
      estPnl = netUsdt - estCostOut;
    }

    return { grossUsd, feeAmt, feeAsset, netAsset, netUsdt, estCostOut, estPnl };
  }, [quantity, effectiveRate, feePercentage, side, assetCode, position]);

  const canSubmit = walletId && assetCode && parseFloat(quantity) > 0 && effectiveRate > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const qty = parseFloat(quantity);
    const feePct = parseFloat(feePercentage) || 0;

    createMutation.mutate({
      wallet_id: walletId,
      side,
      asset_code: assetCode,
      quantity: qty,
      price_usd: effectiveRate,
      gross_usd_value: calc.grossUsd,
      fee_percentage: feePct,
      fee_amount: calc.feeAmt,
      fee_asset: calc.feeAsset,
      net_asset_change: calc.netAsset,
      net_usdt_change: calc.netUsdt,
      metadata: {
        execution_rate_usdt: effectiveRate,
        local_price: parseFloat(localPrice) || null,
        fx_rate_to_usdt: parseFloat(fxRateToUsdt) || null,
        market_rate_snapshot: parseFloat(marketRateSnapshot) || null,
      },
    }, {
      onSuccess: () => {
        setQuantity("");
        setPriceUsd("");
        setFeePercentage("");
        setLocalPrice("");
        setFxRateToUsdt("");
        setMarketRateSnapshot("");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowRightLeft className="h-5 w-5" />
            New Conversion Entry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>
                  {wallets.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.wallet_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Side</Label>
              <Select value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">BUY (Acquire Asset)</SelectItem>
                  <SelectItem value="SELL">SELL (Dispose Asset)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Asset</Label>
              <Select value={assetCode} onValueChange={setAssetCode}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>
                  {ASSET_OPTIONS.map((a) => (
                    <SelectItem key={a.code} value={a.code}>{a.code} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>
                Execution Rate (USDT/unit)
                {derivedExecRate && (
                  <span className="text-xs text-muted-foreground ml-1">(auto-derived)</span>
                )}
              </Label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={derivedExecRate ? derivedExecRate.toFixed(9) : priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                disabled={!!derivedExecRate}
              />
            </div>

            <div className="space-y-2">
              <Label>Fee % (optional)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                max="100"
                placeholder="0"
                value={feePercentage}
                onChange={(e) => setFeePercentage(e.target.value)}
              />
            </div>
          </div>

          {/* Advanced: Local Price / FX Rate */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                <Info className="h-3 w-3" />
                {showAdvanced ? 'Hide' : 'Show'} Local Price & Market Rate
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded-lg border border-dashed">
                <div className="space-y-2">
                  <Label className="text-xs">Local Price (INR)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 6100000"
                    value={localPrice}
                    onChange={(e) => setLocalPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">FX Rate (INR per USDT)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 96.50"
                    value={fxRateToUsdt}
                    onChange={(e) => setFxRateToUsdt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Market Rate Snapshot (USDT)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 67044"
                    value={marketRateSnapshot}
                    onChange={(e) => setMarketRateSnapshot(e.target.value)}
                  />
                </div>
                {derivedExecRate && (
                  <p className="text-xs text-muted-foreground col-span-full">
                    Derived execution rate: <span className="font-mono font-medium">{derivedExecRate.toFixed(9)} USDT</span> = {localPrice} / {fxRateToUsdt}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            className="w-full mt-4"
          >
            {createMutation.isPending ? "Submitting..." : "Submit for Approval"}
          </Button>
        </CardContent>
      </Card>

      {/* Live Calculation + Position Panel */}
      <div className="space-y-4">
        {/* WAC Position */}
        {walletId && assetCode && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Current Position: {assetCode}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {position && Number(position.qty_on_hand) > 0 ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Qty On Hand</span>
                    <span className="font-mono font-medium">{formatSmartDecimal(position.qty_on_hand)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Cost (USDT)</span>
                    <span className="font-mono font-medium">${formatSmartDecimal(position.avg_cost_usdt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost Pool</span>
                    <span className="font-mono font-medium">${formatSmartDecimal(position.cost_pool_usdt, 4)}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No position yet for this asset in this wallet.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Live Preview */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Live Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Side</span>
              <Badge variant={side === 'BUY' ? 'default' : 'secondary'}>{side}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Exec Rate</span>
              <span className="font-mono font-medium">${formatSmartDecimal(effectiveRate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross USD Value</span>
              <span className="font-mono font-medium">${formatSmartDecimal(calc.grossUsd, 4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fee ({calc.feeAsset || '—'})</span>
              <span className="font-mono">{formatSmartDecimal(calc.feeAmt, 9)}</span>
            </div>
            <hr />
            <div className="flex justify-between font-semibold">
              <span>Net {assetCode || 'Asset'} Change</span>
              <span className="font-mono">
                {side === 'BUY' ? '+' : '-'}{formatSmartDecimal(calc.netAsset)}
              </span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Net USDT Change</span>
              <span className="font-mono">
                {side === 'BUY' ? '-' : '+'}{formatSmartDecimal(calc.netUsdt, 4)}
              </span>
            </div>

            {/* SELL: Estimated P&L */}
            {side === 'SELL' && position && Number(position.avg_cost_usdt) > 0 && parseFloat(quantity) > 0 && (
              <>
                <hr />
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Est. COGS (WAC)</span>
                  <span className="font-mono">${formatSmartDecimal(calc.estCostOut, 4)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Est. Realized P&L</span>
                  <span className={`font-mono ${calc.estPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {calc.estPnl >= 0 ? '+' : ''}${formatSmartDecimal(calc.estPnl, 4)}
                  </span>
                </div>
              </>
            )}

            {side === 'BUY' && (
              <p className="text-xs text-muted-foreground mt-2">
                USDT debited. {assetCode || 'Asset'} credited (minus fee). WAC position updated.
              </p>
            )}
            {side === 'SELL' && (
              <p className="text-xs text-muted-foreground mt-2">
                {assetCode || 'Asset'} debited. USDT credited (minus fee). Realized P&L recorded.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
