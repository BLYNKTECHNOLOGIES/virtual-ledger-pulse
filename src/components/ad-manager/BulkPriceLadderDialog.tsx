import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  onComplete: () => void;
}

/** Fixed ladder step — one rung is 0.5 below the previous. */
export const LADDER_STEP = 0.5;

type ResultStatus = 'pending' | 'success' | 'error';

interface Rung {
  ad: BinanceAd;
  /** true = floating ad, ladder applies to priceFloatingRatio */
  floating: boolean;
  current: number;
  next: number;
}

interface RungResult extends Rung {
  status: ResultStatus;
  message?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Builds the descending ladder, applied separately within each price-type family. */
export function buildLadder(ads: BinanceAd[], top: number): Rung[] {
  const family = (floating: boolean) =>
    ads
      .filter((ad) => (ad.priceType === 2) === floating)
      .map((ad) => ({
        ad,
        floating,
        current: floating ? Number(ad.priceFloatingRatio || 0) : Number(ad.price || 0),
      }))
      .sort((a, b) => b.current - a.current)
      .map((r, i) => ({ ...r, next: round2(top - i * LADDER_STEP) }));

  return [...family(false), ...family(true)];
}

export function BulkPriceLadderDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const [value, setValue] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<RungResult[]>([]);

  const top = Number(value);
  const ladder = useMemo(
    () => (value && !isNaN(top) ? buildLadder(ads, top) : []),
    [ads, value, top],
  );
  const invalidRung = ladder.find((r) => r.next <= 0);

  const asset = ads[0]?.asset;
  const side = ads[0]?.tradeType;
  const hasFixed = ads.some((a) => a.priceType !== 2);
  const hasFloating = ads.some((a) => a.priceType === 2);

  const reset = () => { setValue(''); setStep('form'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const handleConfirm = () => {
    if (!value || isNaN(top)) {
      toast({ title: 'Top rate required', description: 'Enter the rate for the highest-priced ad', variant: 'destructive' });
      return;
    }
    if (invalidRung) {
      toast({
        title: 'Ladder goes below zero',
        description: `Rung ${ladder.indexOf(invalidRung) + 1} would be ${invalidRung.next}. Raise the top rate or select fewer ads.`,
        variant: 'destructive',
      });
      return;
    }
    setStep('confirm');
  };

  const executeUpdates = async () => {
    setStep('executing');
    const initial: RungResult[] = ladder.map((r) => ({ ...r, status: 'pending' }));
    setResults(initial);

    for (let i = 0; i < ladder.length; i++) {
      const { ad, floating, current, next } = ladder[i];
      if (i > 0) await new Promise((r) => setTimeout(r, 300));

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
            priceType: floating ? 2 : 1,
            initAmount: ad.initAmount,
            surplusAmount: ad.surplusAmount,
            minSingleTransAmount: ad.minSingleTransAmount,
            maxSingleTransAmount: ad.maxSingleTransAmount,
            ...(floating
              ? { priceFloatingRatio: next, oldRatio: current }
              : { price: next, oldPrice: current }),
            tradeMethods,
            payTimeLimit: ad.payTimeLimit || 15,
          }, {
            onSuccess: () => resolve(),
            onError: (e) => reject(e),
          });
        });
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'success' } : r)));
      } catch (e: any) {
        setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'error', message: e?.message || 'Failed' } : r)));
      }
    }
    setStep('done');
  };

  const successCount = results.filter((r) => r.status === 'success').length;
  const failCount = results.filter((r) => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Price Ladder</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Step <strong>{ads.length}</strong> {side} {asset} ad{ads.length !== 1 ? 's' : ''} down in fixed {LADDER_STEP} increments,
              highest-priced first.
            </p>
            <div>
              <Label>Top rate</Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 100"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Highest ad gets this rate, next {round2(top || 0) - LADDER_STEP > 0 ? round2((top || 0) - LADDER_STEP) : '…'}, and so on.
              </p>
            </div>
            {hasFixed && hasFloating && (
              <p className="text-xs text-warning">
                Selection mixes fixed and floating ads — the ladder runs separately inside each family
                (fixed ads get a price ladder, floating ads get a ratio ladder).
              </p>
            )}
            {invalidRung && (
              <p className="text-xs text-destructive">
                This top rate takes a rung to {invalidRung.next}. Raise it or select fewer ads.
              </p>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Confirm Price Ladder</p>
                <p className="text-muted-foreground mt-1">
                  {ladder.length} {side} {asset} ad(s) will be re-priced from <strong>{round2(top).toFixed(2)}</strong> downwards in {LADDER_STEP} steps.
                </p>
              </div>
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {ladder.map((r, i) => (
                  <div key={r.ad.advNo} className="flex items-center justify-between text-xs px-1">
                    <span className="font-mono">
                      {i + 1}. …{r.ad.advNo.slice(-8)} {r.floating ? '(float %)' : ''}
                    </span>
                    <span>
                      {r.current.toFixed(2)} → <strong>{r.next.toFixed(2)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <ScrollArea className="max-h-60">
            <div className="space-y-2 py-2">
              {step === 'done' && (
                <p className="text-sm font-medium mb-2">
                  {failCount === 0 ? '✅ All ads re-priced' : `⚠️ ${successCount} succeeded, ${failCount} failed`}
                </p>
              )}
              {results.map((r) => (
                <div key={r.ad.advNo} className="flex items-center gap-2 text-sm">
                  {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {r.status === 'success' && <CheckCircle className="h-4 w-4 text-success" />}
                  {r.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-mono text-xs">…{r.ad.advNo.slice(-8)}</span>
                  <span className="text-xs text-muted-foreground">{r.current.toFixed(2)} → {r.next.toFixed(2)}</span>
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
              <Button onClick={handleConfirm} disabled={!!invalidRung}>Next</Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={executeUpdates}>Confirm & Apply</Button>
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
