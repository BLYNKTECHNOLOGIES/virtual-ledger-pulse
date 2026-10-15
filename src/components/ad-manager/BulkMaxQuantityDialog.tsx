import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Loader2, Maximize2, ArrowRight } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { adZone, ZONE_SHORT } from '@/lib/adZone';
import { useAdCapacityMap, capacityKey } from '@/hooks/useAdCapacityLimits';
import { useBinanceBalances } from '@/hooks/useBinanceAssets';
import { useToast } from '@/hooks/use-toast';
import { AdDialogHeader, CHIP_MUTED, NoteBox, RunIcon, RunSummary, SideChip, shortAdNo } from './adUi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  onComplete: () => void;
}

type Bound = 'cap' | 'balance' | 'none';
interface PlanRow {
  ad: BinanceAd;
  current: number;
  remaining: number;
  target: number | null;
  cap: number | null;
  available: number | null;
  bound: Bound;
  skipReason?: string;
}

type ResultStatus = 'pending' | 'success' | 'error' | 'skipped';

const fmtQty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function BulkMaxQuantityDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const { map, isLoading } = useAdCapacityMap();
  const { data: balances } = useBinanceBalances();
  const [step, setStep] = useState<'preview' | 'executing' | 'done'>('preview');
  const [results, setResults] = useState<Record<string, { status: ResultStatus; message?: string }>>({});

  const balanceOf = (asset: string) =>
    balances?.find((b) => b.asset.toUpperCase() === asset.toUpperCase())?.total_free ?? null;

  const plan: PlanRow[] = useMemo(() => {
    return ads.map((ad) => {
      const zone = adZone(ad);
      const current = Number(ad.initAmount) || 0;
      const remaining = Number(ad.surplusAmount) || 0;
      const row = map.get(capacityKey(ad._exchangeAccountId, ad.asset, zone, ad.tradeType));
      const cap = row?.max_accepted_qty ?? null;
      const available = ad.tradeType === 'SELL' ? balanceOf(ad.asset) : null;

      if (cap === null) {
        return { ad, current, remaining, target: null, cap, available, bound: 'none' as Bound, skipReason: 'No saved maximum quantity for this asset/zone/side' };
      }
      let target = cap;
      let bound: Bound = 'cap';
      if (ad.tradeType === 'SELL') {
        if (available === null) {
          return { ad, current, remaining, target: null, cap, available, bound: 'none' as Bound, skipReason: 'Available balance unavailable — cannot clamp safely' };
        }
        if (available < cap) { target = available; bound = 'balance'; }
      }
      if (target <= 0) {
        return { ad, current, remaining, target: null, cap, available, bound, skipReason: 'Target quantity is zero' };
      }
      return { ad, current, remaining, target, cap, available, bound };
    });
  }, [ads, map, balances]);

  // BUY edits Binance's Tradable Quantity; SELL edits Binance's Quantity.
  // The server converts BUY targets to the cumulative initAmount required by
  // Binance while preserving the amount already traded on the ad.
  const EPS = 0.00000001;
  const needsPush = (p: PlanRow) => p.target !== null && (
    p.ad.tradeType === 'BUY'
      ? Math.abs((p.target as number) - p.remaining) > EPS
      : Math.abs((p.target as number) - p.current) > EPS
  );
  const actionable = plan.filter(needsPush);
  const unchanged = plan.filter((p) => p.target !== null && !needsPush(p));
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
        const notice = await new Promise<string | undefined>((resolve, reject) => {
          updateAd.mutate({
            advNo: ad.advNo,
            exchange_account_id: ad._exchangeAccountId,
            asset: ad.asset,
            fiatUnit: ad.fiatUnit,
            tradeType: ad.tradeType,
            priceType: ad.priceType,
            desiredRemainingAmount: row.target as number,
            minSingleTransAmount: Number(ad.minSingleTransAmount),
            maxSingleTransAmount: Number(ad.maxSingleTransAmount),
            tradeMethods,
            payTimeLimit: ad.payTimeLimit || 15,
            ...(ad.priceType === 1 ? { price: ad.price } : { priceFloatingRatio: ad.priceFloatingRatio }),
          }, {
            onSuccess: (data: any) => resolve(data?.data?.quantityNotice || data?.quantityNotice),
            onError: (e) => reject(e),
          });
        });
        setResults((prev) => ({ ...prev, [ad.advNo]: { status: 'success', message: notice } }));
      } catch (e: any) {
        const message = e?.message || 'Failed';
        setResults((prev) => ({ ...prev, [ad.advNo]: { status: 'error', message } }));
      }
    }
    setStep('done');
  };

  const successCount = Object.values(results).filter((r) => r.status === 'success').length;
  const failCount = Object.values(results).filter((r) => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <AdDialogHeader icon={Maximize2} title="Set maximum quantity" description="Sets each ad to the saved maximum for its asset, zone and side, capped by the free balance on sell ads. Ads above that amount are lowered." />

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="inline-flex h-6 items-center rounded-md border border-primary/25 bg-primary/10 px-2 font-semibold text-foreground tabular-nums">{actionable.length} will change</span>
              {unchanged.length > 0 && <span className="inline-flex h-6 items-center rounded-md border border-border bg-secondary/60 px-2 text-muted-foreground tabular-nums">{unchanged.length} already at max</span>}
              {skipped.length > 0 && <span className="inline-flex h-6 items-center rounded-md border border-warning/40 bg-warning/10 px-2 text-warning tabular-nums">{skipped.length} skipped</span>}
            </div>

            <ScrollArea className="max-h-[22rem] rounded-md border border-border">
              <div className="divide-y divide-border">
                {plan.map((p) => {
                  const res = results[p.ad.advNo];
                  return (
                    <div key={p.ad.advNo} className="px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-foreground">{p.ad.asset}</span>
                          <SideChip side={p.ad.tradeType} />
                          <span className={CHIP_MUTED}>{ZONE_SHORT[adZone(p.ad)]}</span>
                          <span className="t-mono text-xs text-muted-foreground truncate">{shortAdNo(p.ad.advNo)}</span>
                        </div>
                        {res && <RunIcon status={res.status} />}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {p.target === null ? (
                          <span className="text-warning">{p.skipReason}</span>
                        ) : (
                          <>
                            {p.ad.tradeType === 'BUY' ? 'tradable quantity' : 'quantity'}{' '}
                            <span className="tabular-nums">{fmtQty(p.ad.tradeType === 'BUY' ? p.remaining : p.current)}</span> <ArrowRight className="inline h-3 w-3 align-[-2px]" /> <span className="text-foreground font-semibold tabular-nums">{fmtQty(p.target)}</span> {p.ad.asset}
                            {' · '}
                            {p.bound === 'balance'
                              ? `clamped to available balance (cap ${fmtQty(p.cap as number)})`
                              : `saved maximum${p.available !== null ? ` · balance ${fmtQty(p.available)}` : ''}`}
                          </>

                        )}
                        {res?.message && res.status === 'error' && <div className="text-destructive mt-1">{res.message}</div>}
                        {res?.message && res.status === 'success' && <div className="text-warning mt-1">{res.message}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {step === 'preview' && actionable.length > 0 && (
              <NoteBox>This publishes new quantities to Binance for {actionable.length} ad{actionable.length !== 1 ? 's' : ''}.</NoteBox>
            )}

            {step === 'done' && (
              <RunSummary ok={successCount} failed={failCount} okText={`${successCount} ad${successCount !== 1 ? 's' : ''} updated`} />
            )}
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'preview' && (
            <>
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
