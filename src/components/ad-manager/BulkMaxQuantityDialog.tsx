import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle, XCircle, Loader2, Maximize2, Gauge } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { adZone, ZONE_SHORT } from '@/lib/adZone';
import { useAdCapacityMap, capacityKey, useUpsertCapacityLimit } from '@/hooks/useAdCapacityLimits';
import { useBinanceBalances } from '@/hooks/useBinanceAssets';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  onComplete: () => void;
  /** Opens the capacity calibration dialog. */
  onCalibrate?: () => void;
}

type Bound = 'cap' | 'balance' | 'none';
interface PlanRow {
  ad: BinanceAd;
  current: number;
  target: number | null;
  cap: number | null;
  available: number | null;
  bound: Bound;
  skipReason?: string;
}
type ResultStatus = 'pending' | 'success' | 'error' | 'skipped';

const fmtQty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function BulkMaxQuantityDialog({ open, onOpenChange, ads, onComplete, onCalibrate }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const { map, isLoading } = useAdCapacityMap();
  const { data: balances } = useBinanceBalances();
  const upsertCap = useUpsertCapacityLimit();
  const [step, setStep] = useState<'preview' | 'executing' | 'done'>('preview');
  const [results, setResults] = useState<Record<string, { status: ResultStatus; message?: string }>>({});

  const balanceOf = (asset: string) =>
    balances?.find((b) => b.asset.toUpperCase() === asset.toUpperCase())?.total_free ?? null;

  const plan: PlanRow[] = useMemo(() => {
    return ads.map((ad) => {
      const zone = adZone(ad);
      const current = Number(ad.initAmount) || 0;
      const row = map.get(capacityKey(ad._exchangeAccountId, ad.asset, zone, ad.tradeType));
      const cap = row?.max_accepted_qty ?? null;
      const available = ad.tradeType === 'SELL' ? balanceOf(ad.asset) : null;

      if (cap === null) {
        return { ad, current, target: null, cap, available, bound: 'none' as Bound, skipReason: 'Not calibrated — run Calibrate limits for this asset/zone/side' };
      }
      let target = cap;
      let bound: Bound = 'cap';
      if (ad.tradeType === 'SELL') {
        if (available === null) {
          return { ad, current, target: null, cap, available, bound: 'none' as Bound, skipReason: 'Available balance unavailable — cannot clamp safely' };
        }
        if (available < cap) { target = available; bound = 'balance'; }
      }
      if (target <= 0) {
        return { ad, current, target: null, cap, available, bound, skipReason: 'Target quantity is zero' };
      }
      return { ad, current, target, cap, available, bound };
    });
  }, [ads, map, balances]);

  const actionable = plan.filter((p) => p.target !== null && Math.abs(p.target - p.current) > 0.00000001);
  const unchanged = plan.filter((p) => p.target !== null && Math.abs((p.target as number) - p.current) <= 0.00000001);
  const skipped = plan.filter((p) => p.target === null);

  const reset = () => { setStep('preview'); setResults({}); };
  const handleClose = (v: boolean) => {
    if (!v) { if (step === 'done') onComplete(); reset(); }
    onOpenChange(v);
  };

  const execute = async () => {
    if (actionable.length === 0) return;
    setStep('executing');
    const init: Record<string, { status: ResultStatus; message?: string }> = {};
    plan.forEach((p) => { init[p.ad.advNo] = { status: p.target === null ? 'skipped' : 'pending', message: p.skipReason }; });
    unchanged.forEach((p) => { init[p.ad.advNo] = { status: 'skipped', message: 'Already at maximum' }; });
    setResults(init);

    for (const row of actionable) {
      const ad = row.ad;
      try {
        const tradeMethods = (ad.tradeMethods || []).map((m) => ({
          payType: m.payType,
          identifier: m.identifier,
          ...(m.payId ? { payId: m.payId } : {}),
        }));
        await new Promise<void>((resolve, reject) => {
          updateAd.mutate({
            advNo: ad.advNo,
            exchange_account_id: ad._exchangeAccountId,
            asset: ad.asset,
            fiatUnit: ad.fiatUnit,
            tradeType: ad.tradeType,
            priceType: ad.priceType,
            initAmount: row.target as number,
            minSingleTransAmount: Number(ad.minSingleTransAmount),
            maxSingleTransAmount: Number(ad.maxSingleTransAmount),
            tradeMethods,
            payTimeLimit: ad.payTimeLimit || 15,
            ...(ad.priceType === 1 ? { price: ad.price } : { priceFloatingRatio: ad.priceFloatingRatio }),
          }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
        setResults((prev) => ({ ...prev, [ad.advNo]: { status: 'success' } }));
      } catch (e: any) {
        const message = e?.message || 'Failed';
        setResults((prev) => ({ ...prev, [ad.advNo]: { status: 'error', message } }));
        // Binance rejected a value our table said was fine → lower the ceiling
        // to just under the rejected value and flag it for re-calibration.
        if (row.bound === 'cap' && row.cap !== null && ad._exchangeAccountId) {
          try {
            await upsertCap.mutateAsync({
              exchange_account_id: ad._exchangeAccountId,
              asset: ad.asset,
              zone: adZone(ad),
              trade_type: ad.tradeType as 'BUY' | 'SELL',
              max_accepted_qty: Math.max(0, Math.floor((row.target as number) * 0.99)),
              min_rejected_qty: row.target as number,
              source: 'learned',
              binance_error_message: String(message).slice(0, 500),
              needs_recalibration: true,
            });
          } catch { /* surfaced through the row error already */ }
        }
      }
    }
    setStep('done');
  };

  const successCount = Object.values(results).filter((r) => r.status === 'success').length;
  const failCount = Object.values(results).filter((r) => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Maximize2 className="h-4 w-4" /> Set Maximum Quantity
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{actionable.length} will change</Badge>
              {unchanged.length > 0 && <Badge variant="outline">{unchanged.length} already at max</Badge>}
              {skipped.length > 0 && <Badge variant="outline" className="text-warning border-warning/40">{skipped.length} skipped</Badge>}
            </div>

            <ScrollArea className="max-h-[22rem] pr-2">
              <div className="space-y-2 py-1">
                {plan.map((p) => {
                  const res = results[p.ad.advNo];
                  return (
                    <div key={p.ad.advNo} className="rounded-lg border border-border p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium">{p.ad.asset}</span>
                          <Badge variant="outline" className="text-[10px]">{p.ad.tradeType}</Badge>
                          <Badge variant="outline" className="text-[10px]">{ZONE_SHORT[adZone(p.ad)]}</Badge>
                          <span className="text-xs text-muted-foreground truncate">…{p.ad.advNo.slice(-8)}</span>
                        </div>
                        {res?.status === 'success' && <CheckCircle className="h-4 w-4 text-success shrink-0" />}
                        {res?.status === 'error' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                        {res?.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {p.target === null ? (
                          <span className="text-warning">{p.skipReason}</span>
                        ) : (
                          <>
                            {fmtQty(p.current)} → <span className="text-foreground font-medium">{fmtQty(p.target)}</span> {p.ad.asset}
                            {' · '}
                            {p.bound === 'balance'
                              ? `clamped to available balance (cap ${fmtQty(p.cap as number)})`
                              : `calibrated ceiling${p.available !== null ? ` · balance ${fmtQty(p.available)}` : ''}`}
                          </>
                        )}
                        {res?.message && res.status === 'error' && <div className="text-destructive mt-1">{res.message}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {step === 'preview' && actionable.length > 0 && (
              <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <span>This publishes new quantities to Binance for {actionable.length} ad{actionable.length !== 1 ? 's' : ''}.</span>
              </div>
            )}

            {step === 'done' && (
              <p className="text-sm font-medium">
                {failCount === 0 ? `✅ ${successCount} ad(s) updated` : `⚠️ ${successCount} succeeded, ${failCount} failed`}
              </p>
            )}
          </>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {step === 'preview' && (
            <>
              {onCalibrate && (
                <Button
                  variant="secondary"
                  onClick={() => { handleClose(false); onCalibrate(); }}
                  className="sm:mr-auto"
                >
                  <Gauge className="h-4 w-4 mr-2" />
                  Calibrate limits
                </Button>
              )}
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={execute} disabled={actionable.length === 0}>
                Apply to {actionable.length} ad{actionable.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {step === 'executing' && <Button disabled><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating…</Button>}
          {step === 'done' && <Button onClick={() => handleClose(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
