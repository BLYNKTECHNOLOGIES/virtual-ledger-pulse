import { useState } from 'react';
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

type ResultStatus = 'pending' | 'success' | 'error';
interface AdResult { advNo: string; status: ResultStatus; message?: string; oldRatio?: number | string; newRatio?: number }

export function BulkFloatingPriceDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const [value, setValue] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<AdResult[]>([]);

  const reset = () => { setValue(''); setStep('form'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  // Always sets the ratio to exactly the entered value — no addition/adjustment
  const getNewRatio = (): number => Number(value) || 0;

  const handleConfirm = () => {
    if (!value || isNaN(Number(value))) {
      toast({ title: 'Value required', description: 'Enter a floating ratio value', variant: 'destructive' });
      return;
    }
    setStep('confirm');
  };

  const executeUpdates = async () => {
    setStep('executing');
    const newRatio = getNewRatio();
    const initial: AdResult[] = ads.map(ad => ({
      advNo: ad.advNo,
      status: 'pending',
      oldRatio: ad.priceFloatingRatio,
      newRatio,
    }));
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

        await new Promise<void>((resolve, reject) => {
          updateAd.mutate({
            advNo: ad.advNo,
            asset: ad.asset,
            fiatUnit: ad.fiatUnit,
            tradeType: ad.tradeType,
            priceType: 2,
            initAmount: ad.initAmount,
            surplusAmount: ad.surplusAmount,
            minSingleTransAmount: ad.minSingleTransAmount,
            maxSingleTransAmount: ad.maxSingleTransAmount,
            priceFloatingRatio: newRatio,
            tradeMethods,
            payTimeLimit: ad.payTimeLimit || 15,
          }, {
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Floating Price Update</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Set floating price ratio for <strong>{ads.length}</strong> floating ad{ads.length !== 1 ? 's' : ''}.
            </p>
            <div>
              <Label>New Floating Ratio (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="e.g. 103.5"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                All selected ads will be set to exactly this ratio — the current ratio is replaced, not added to.
              </p>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Confirm Bulk Floating Price Update</p>
                <p className="text-muted-foreground mt-1">
                  Set floating ratio to exactly <strong>{value}%</strong> for {ads.length} ad(s).
                  Current ratios will be replaced.
                </p>
              </div>
            </div>
            <ScrollArea className="max-h-40">
              <div className="space-y-1">
                {ads.map(ad => (
                  <div key={ad.advNo} className="flex items-center justify-between text-xs px-1">
                    <span className="font-mono">…{ad.advNo.slice(-8)}</span>
                    <span>
                      {Number(ad.priceFloatingRatio || 0).toFixed(2)}% → <strong>{getNewRatio().toFixed(2)}%</strong>
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
                  {failCount === 0 ? '✅ All ads updated' : `⚠️ ${successCount} succeeded, ${failCount} failed`}
                </p>
              )}
              {results.map(r => (
                <div key={r.advNo} className="flex items-center gap-2 text-sm">
                  {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {r.status === 'success' && <CheckCircle className="h-4 w-4 text-success" />}
                  {r.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-mono text-xs">…{r.advNo.slice(-8)}</span>
                  <span className="text-xs text-muted-foreground">{Number(r.oldRatio || 0).toFixed(2)}% → {Number(r.newRatio || 0).toFixed(2)}%</span>
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
              <Button onClick={handleConfirm}>Next</Button>
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
