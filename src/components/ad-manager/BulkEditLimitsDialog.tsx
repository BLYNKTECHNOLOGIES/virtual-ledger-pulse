import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
interface AdResult { advNo: string; status: ResultStatus; message?: string }

export function BulkEditLimitsDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<AdResult[]>([]);

  const reset = () => { setMin(''); setMax(''); setStep('form'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const validate = (): string | null => {
    if (!min || Number(min) <= 0) return 'Min order limit is required';
    if (!max || Number(max) <= 0) return 'Max order limit is required';
    if (Number(min) >= Number(max)) return 'Min must be less than max';
    return null;
  };

  const handleConfirm = () => {
    const err = validate();
    if (err) { toast({ title: 'Validation Error', description: err, variant: 'destructive' }); return; }
    setStep('confirm');
  };

  const executeUpdates = async () => {
    setStep('executing');
    const initial: AdResult[] = ads.map(ad => ({ advNo: ad.advNo, status: 'pending' }));
    setResults(initial);

    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      try {
        // Build tradeMethods with only the fields Binance expects for update
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
            priceType: ad.priceType,
            initAmount: ad.initAmount,
            surplusAmount: ad.surplusAmount,
            minSingleTransAmount: Number(min),
            maxSingleTransAmount: Number(max),
            tradeMethods,
            payTimeLimit: ad.payTimeLimit || 15,
            ...(ad.priceType === 1 ? { price: ad.price } : { priceFloatingRatio: ad.priceFloatingRatio }),
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
          <DialogTitle>Bulk Edit Order Limits</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Update order limits for <strong>{ads.length}</strong> selected ad{ads.length !== 1 ? 's' : ''}.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Min Order (₹)</Label>
                <Input type="number" value={min} onChange={e => setMin(e.target.value)} placeholder="e.g. 500" />
              </div>
              <div>
                <Label>Max Order (₹)</Label>
                <Input type="number" value={max} onChange={e => setMax(e.target.value)} placeholder="e.g. 50000" />
              </div>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Confirm Bulk Update</p>
                <p className="text-muted-foreground mt-1">
                  This will update <strong>{ads.length}</strong> ad{ads.length !== 1 ? 's' : ''} with:
                </p>
                <ul className="mt-1 list-disc list-inside text-muted-foreground">
                  <li>Min Order: ₹{Number(min).toLocaleString('en-IN')}</li>
                  <li>Max Order: ₹{Number(max).toLocaleString('en-IN')}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <ScrollArea className="max-h-60">
            <div className="space-y-2 py-2">
              {step === 'done' && (
                <p className="text-sm font-medium mb-2">
                  {failCount === 0 ? '✅ All ads updated successfully' : `⚠️ ${successCount} succeeded, ${failCount} failed`}
                </p>
              )}
              {results.map(r => (
                <div key={r.advNo} className="flex items-center gap-2 text-sm">
                  {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {r.status === 'success' && <CheckCircle className="h-4 w-4 text-success" />}
                  {r.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-mono text-xs">…{r.advNo.slice(-8)}</span>
                  {r.message && <span className="text-xs text-destructive">{r.message}</span>}
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
