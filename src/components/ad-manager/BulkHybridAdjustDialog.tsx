import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle, XCircle, Loader2, Info } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { useUSDTRate } from '@/hooks/useUSDTRate';
import { useHybridPriceAdjuster } from '@/hooks/useHybridPriceAdjuster';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

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
        <DialogHeader>
          <DialogTitle>Hybrid Price Adjust</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Set a target USDT price. Fixed ads will use it directly; floating ads will get a calculated ratio.
            </p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Fixed Ads</p>
                <p className="font-medium">{fixedAds.length}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Floating Ads</p>
                <p className="font-medium">{floatingAds.length}</p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <span className="text-muted-foreground">Live USDT/INR: </span>
                <span className="font-medium">₹{liveRate.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground ml-2">({rateData?.source})</span>
              </div>
            </div>

            <div>
              <Label>Target USDT Price (₹)</Label>
              <Input
                type="number"
                step="0.01"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                placeholder="e.g. 96"
                autoFocus
              />
            </div>

            {calculation && (
              <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-1.5 text-xs">
                <p><span className="text-muted-foreground">Difference:</span> ₹{calculation.target} - ₹{liveRate.toFixed(2)} = <strong>₹{calculation.diff}</strong></p>
                <p><span className="text-muted-foreground">Raw Floating %:</span> ({calculation.diff} / {calculation.target}) × 100 = <strong>{calculation.rawPct}%</strong></p>
                <p><span className="text-muted-foreground">Floating Ratio:</span> 100 + {calculation.rawPct} = <strong>{calculation.floatingRatio}%</strong></p>
                <p><span className="text-muted-foreground">Adjuster:</span> -{adjuster}</p>
                <p className="pt-1 border-t border-border font-medium">
                  Final Floating Ratio: <strong>{calculation.finalRatio}%</strong>
                </p>
                <div className="pt-1 border-t border-border">
                  <p>Fixed ads → <Badge variant="outline">₹{calculation.target}</Badge></p>
                  <p>Floating ads → <Badge variant="outline">{calculation.finalRatio}%</Badge></p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && calculation && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Confirm Hybrid Adjust</p>
                <p className="text-muted-foreground mt-1">
                  {fixedAds.length} fixed ad(s) → ₹{calculation.target} &nbsp;|&nbsp;
                  {floatingAds.length} floating ad(s) → {calculation.finalRatio}%
                </p>
              </div>
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {ads.map(ad => {
                  const isFloating = ad.priceType === 2;
                  return (
                    <div key={ad.advNo} className="flex items-center justify-between text-xs px-1">
                      <span className="font-mono">…{ad.advNo.slice(-8)}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{isFloating ? 'Float' : 'Fixed'}</Badge>
                        <span>
                          {isFloating
                            ? `${Number(ad.priceFloatingRatio || 0).toFixed(2)}% → ${calculation.finalRatio}%`
                            : `₹${Number(ad.price).toFixed(2)} → ₹${calculation.target}`
                          }
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <ScrollArea className="max-h-60">
            <div className="space-y-2 py-2">
              {step === 'done' && (
                <p className="text-sm font-medium mb-2">
                  {failCount === 0 ? '✅ All ads updated' : `⚠️ ${successCount} succeeded, ${failCount} failed`}
                </p>
              )}
              {results.map(r => (
                <div key={r.advNo} className="flex items-center gap-2 text-sm">
                  {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {r.status === 'success' && <CheckCircle className="h-4 w-4 text-success" />}
                  {r.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-mono text-xs">…{r.advNo.slice(-8)}</span>
                  <Badge variant="outline" className="text-[10px]">{r.adType}</Badge>
                  <span className="text-xs text-muted-foreground">{r.oldValue} → {r.newValue}</span>
                  {r.message && <span className="text-xs text-destructive ml-auto">{r.message}</span>}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={!calculation}>Next</Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={executeUpdates}>Confirm & Update</Button>
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
