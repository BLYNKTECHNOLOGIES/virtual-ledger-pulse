
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateConversion } from "@/hooks/useProductConversions";
import { ArrowRightLeft, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

  const calc = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(priceUsd) || 0;
    const feePct = parseFloat(feePercentage) || 0;
    const grossUsd = qty * price;
    const feeAmt = side === 'BUY'
      ? (feePct / 100) * qty   // fee in asset
      : (feePct / 100) * grossUsd; // fee in USDT
    const feeAsset = side === 'BUY' ? assetCode : 'USDT';
    const netAsset = side === 'BUY' ? qty - feeAmt : qty;
    const netUsdt = side === 'BUY' ? grossUsd : grossUsd - feeAmt;

    return { grossUsd, feeAmt, feeAsset, netAsset, netUsdt };
  }, [quantity, priceUsd, feePercentage, side, assetCode]);

  const canSubmit = walletId && assetCode && parseFloat(quantity) > 0 && parseFloat(priceUsd) > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const qty = parseFloat(quantity);
    const price = parseFloat(priceUsd);
    const feePct = parseFloat(feePercentage) || 0;

    createMutation.mutate({
      wallet_id: walletId,
      side,
      asset_code: assetCode,
      quantity: qty,
      price_usd: price,
      gross_usd_value: calc.grossUsd,
      fee_percentage: feePct,
      fee_amount: calc.feeAmt,
      fee_asset: calc.feeAsset,
      net_asset_change: calc.netAsset,
      net_usdt_change: calc.netUsdt,
    }, {
      onSuccess: () => {
        setQuantity("");
        setPriceUsd("");
        setFeePercentage("");
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
              <Label>USD Price (per unit)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
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

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            className="w-full mt-4"
          >
            {createMutation.isPending ? "Submitting..." : "Submit for Approval"}
          </Button>
        </CardContent>
      </Card>

      {/* Live Calculation Panel */}
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
            <span className="text-muted-foreground">Gross USD Value</span>
            <span className="font-mono font-medium">${calc.grossUsd.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fee ({calc.feeAsset || '—'})</span>
            <span className="font-mono">{calc.feeAmt.toFixed(6)}</span>
          </div>
          <hr />
          <div className="flex justify-between font-semibold">
            <span>Net {assetCode || 'Asset'} Change</span>
            <span className="font-mono">
              {side === 'BUY' ? '+' : '-'}{calc.netAsset.toFixed(6)}
            </span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Net USDT Change</span>
            <span className="font-mono">
              {side === 'BUY' ? '-' : '+'}{calc.netUsdt.toFixed(2)}
            </span>
          </div>
          {side === 'BUY' && (
            <p className="text-xs text-muted-foreground mt-2">
              USDT will be debited. {assetCode || 'Asset'} will be credited (minus fee).
            </p>
          )}
          {side === 'SELL' && (
            <p className="text-xs text-muted-foreground mt-2">
              {assetCode || 'Asset'} will be debited. USDT will be credited (minus fee).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
