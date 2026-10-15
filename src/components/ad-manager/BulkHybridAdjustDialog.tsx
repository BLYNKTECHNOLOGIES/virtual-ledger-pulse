import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Blend, Info } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { zonesOf } from '@/lib/adZone';

import { useUSDTRate } from '@/hooks/useUSDTRate';
import { useHybridPriceAdjuster } from '@/hooks/useHybridPriceAdjuster';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AdDialogHeader, CHIP_MUTED, NoteBox, RunProgress, RunRow, RunSummary, SelectionSummary, StepRail, shortAdNo } from './adUi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  onComplete: () => void;
}

type ResultStatus = 'pending' | 'success' | 'error';
interface AdResult {
  advNo: string;
  status: ResultStatus;
  message?: string;
  adType: 'fixed' | 'floating';
  oldValue: string;
  newValue: string;
}

export function BulkHybridAdjustDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const { data: rateData } = useUSDTRate();
  const { data: adjuster = 0 } = useHybridPriceAdjuster();

  const [targetPrice, setTargetPrice] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<AdResult[]>([]);

  const liveRate = rateData?.rate || 0;

  const fixedAds = useMemo(() => ads.filter(a => a.priceType === 1), [ads]);
  const floatingAds = useMemo(() => ads.filter(a => a.priceType === 2), [ads]);
  const zones = useMemo(() => zonesOf(ads), [ads]);


  const calculation = useMemo(() => {
    const target = parseFloat(targetPrice);
    if (!target || !liveRate || liveRate <= 0) return null;
    const diff = target - liveRate;
    const rawPct = (diff / target) * 100;
    const floatingRatio = 100 + rawPct;
    const finalRatio = floatingRatio - adjuster;
    return {
      target,
      diff: parseFloat(diff.toFixed(4)),
      rawPct: parseFloat(rawPct.toFixed(4)),
      floatingRatio: parseFloat(floatingRatio.toFixed(4)),
      finalRatio: parseFloat(finalRatio.toFixed(2)),
    };
  }, [targetPrice, liveRate, adjuster]);

  const reset = () => { setTargetPrice(''); setStep('form'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const handleConfirm = () => {
    if (!calculation) {
      toast({ title: 'Enter a valid target USDT price', variant: 'destructive' });
      return;
    }
    setStep('confirm');
  };

  const executeUpdates = async () => {
    if (!calculation) return;
    setStep('executing');

    const initial: AdResult[] = ads.map(ad => {
      const isFloating = ad.priceType === 2;
      return {
        advNo: ad.advNo,
        status: 'pending',
        adType: isFloating ? 'floating' : 'fixed',
        oldValue: isFloating ? `${Number(ad.priceFloatingRatio || 0).toFixed(2)}%` : `₹${Number(ad.price).toFixed(2)}`,
        newValue: isFloating ? `${calculation.finalRatio.toFixed(2)}%` : `₹${calculation.target.toFixed(2)}`,
      };
    });
    setResults(initial);

    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      if (i > 0) await new Promise(r => setTimeout(r, 300));

      try {
        const tradeMethods = (ad.tradeMethods || []).map(m => ({
          payType: m.payType,
          identifier: m.identifier,
          ...(m.payId ? { payId: m.payId } : {}),
        }));

        const isFloating = ad.priceType === 2;
        const updatePayload: Record<string, any> = {
          advNo: ad.advNo,
          exchange_account_id: ad._exchangeAccountId,
          asset: ad.asset,
          fiatUnit: ad.fiatUnit,
          tradeType: ad.tradeType,
          priceType: ad.priceType,
          initAmount: ad.initAmount,
          surplusAmount: ad.surplusAmount,
          minSingleTransAmount: ad.minSingleTransAmount,
          maxSingleTransAmount: ad.maxSingleTransAmount,
          tradeMethods,
          payTimeLimit: ad.payTimeLimit || 15,
        };

        if (isFloating) {
          updatePayload.priceFloatingRatio = calculation.finalRatio;
        } else {
          updatePayload.price = calculation.target;
        }

        await new Promise<void>((resolve, reject) => {
          updateAd.mutate(updatePayload, {
            onSuccess: () => resolve(),
            onError: (e) => reject(e),
          });
        });
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'success' } : r));
      } catch (e: any) {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', message: e?.message || 'Failed' } : r));
      }
    }
    setStep('done');
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <AdDialogHeader icon={Blend} title="Hybrid price adjust" description="Set one target USDT price. Fixed ads use it directly; floating ads get the matching ratio." />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SelectionSummary ads={ads} label={`${fixedAds.length} fixed · ${floatingAds.length} floating`} />
          <StepRail steps={['Set', 'Review', 'Apply']} current={step === 'form' ? 0 : step === 'confirm' ? 1 : 2} />
        </div>

        {step === 'form' && (
          <div className="space-y-3">
            {zones.length > 1 && (
              <NoteBox title="Mixed zones">
                Selection mixes P2P-zone and Block-zone ads. These are separate order books trading at
                different price levels — the same target price will be written to both. Apply per zone
                instead if the books are not aligned.
              </NoteBox>
            )}

            <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${rateData?.isFallback ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-secondary/40'}`}>
              <Info className={`h-4 w-4 shrink-0 ${rateData?.isFallback ? 'text-destructive' : 'text-muted-foreground'}`} />
              <div>
                <span className={rateData?.isFallback ? 'text-destructive' : 'text-muted-foreground'}>Live USDT/INR: </span>
                <span className={`font-semibold tabular-nums ${rateData?.isFallback ? 'text-destructive' : 'text-foreground'}`}>₹{liveRate.toFixed(2)}</span>
                <span className={`text-xs ml-2 ${rateData?.isFallback ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>({rateData?.source})</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Target USDT Price (₹)</Label>
              <Input
                type="number"
                step="0.01"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                placeholder="e.g. 96"
                autoFocus
                className="text-base font-semibold tabular-nums"
              />
            </div>

            {calculation && (
              <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
                  <span className="text-muted-foreground">Difference</span><span>₹{calculation.target} - ₹{liveRate.toFixed(2)} = <strong>₹{calculation.diff}</strong></span>
                  <span className="text-muted-foreground">Raw floating %</span><span>({calculation.diff} / {calculation.target}) × 100 = <strong>{calculation.rawPct}%</strong></span>
                  <span className="text-muted-foreground">Floating ratio</span><span>100 + {calculation.rawPct} = <strong>{calculation.floatingRatio}%</strong></span>
                  <span className="text-muted-foreground">Adjuster</span><span>-{adjuster}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
                  <span>Final floating ratio</span><span className="tabular-nums">{calculation.finalRatio}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
                  <div className="rounded-md border border-border bg-card px-2 py-1.5"><div className="text-muted-foreground">Fixed ads</div><div className="text-sm font-semibold tabular-nums">₹{calculation.target}</div></div>
                  <div className="rounded-md border border-border bg-card px-2 py-1.5"><div className="text-muted-foreground">Floating ads</div><div className="text-sm font-semibold tabular-nums">{calculation.finalRatio}%</div></div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && calculation && (
          <div className="space-y-2">
            <NoteBox title="Apply hybrid adjust?">
              {fixedAds.length} fixed ad(s) → ₹{calculation.target} · {floatingAds.length} floating ad(s) → {calculation.finalRatio}%
            </NoteBox>
            <ScrollArea className="max-h-48 rounded-md border border-border">
              <div className="p-1">
                {ads.map(ad => {
                  const isFloating = ad.priceType === 2;
                  return (
                    <div key={ad.advNo} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs odd:bg-secondary/40">
                      <span className="flex items-center gap-1.5"><span className="font-medium text-foreground">{ad.asset}</span><span className="t-mono text-muted-foreground">{shortAdNo(ad.advNo)}</span><span className={CHIP_MUTED}>{isFloating ? 'Float' : 'Fixed'}</span></span>
                      <span className="tabular-nums text-muted-foreground">
                        {isFloating
                          ? `${Number(ad.priceFloatingRatio || 0).toFixed(2)}% → ${calculation.finalRatio}%`
                          : `₹${Number(ad.price).toFixed(2)} → ₹${calculation.target}`
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <div className="space-y-2">
            {step === 'executing' && <RunProgress done={results.filter(r => r.status !== 'pending').length} total={results.length} label="Updating prices…" />}
            {step === 'done' && <RunSummary ok={successCount} failed={failCount} okText="All ads updated" />}
            <ScrollArea className="max-h-60 rounded-md border border-border">
              <div className="p-1">
                {results.map(r => (
                  <RunRow key={r.advNo} status={r.status} advNo={r.advNo} tag={<span className={CHIP_MUTED}>{r.adType}</span>} change={`${r.oldValue} → ${r.newValue}`} message={r.message} />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={!calculation} className="gap-1.5">Review <ArrowRight className="h-3.5 w-3.5" /></Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={executeUpdates}>Update {ads.length} ad{ads.length !== 1 ? 's' : ''}</Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => handleClose(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
