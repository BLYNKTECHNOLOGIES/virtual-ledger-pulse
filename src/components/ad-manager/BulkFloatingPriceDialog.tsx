import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
interface AdResult { advNo: string; status: ResultStatus; message?: string; oldRatio?: number; newRatio?: number }

export function BulkFloatingPriceDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const [mode, setMode] = useState<'set' | 'adjust'>('adjust');
  const [value, setValue] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<AdResult[]>([]);

  const reset = () => { setValue(''); setMode('adjust'); setStep('form'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const computeNewRatio = (current: number): number => {
    if (mode === 'set') return Number(value);
    return current + Number(value);
  };

  const handleConfirm = () => {
    if (!value || Number(value) === 0) {
      toast({ title: 'Value required', description: 'Enter a floating ratio value', variant: 'destructive' });
      return;
    }
    setStep('confirm');
  };

  const executeUpdates = async () => {
    setStep('executing');
    const initial: AdResult[] = ads.map(ad => ({
      advNo: ad.advNo,
      status: 'pending',
      oldRatio: ad.priceFloatingRatio,
      newRatio: computeNewRatio(ad.priceFloatingRatio || 0),
    }));
    setResults(initial);

    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      const newRatio = computeNewRatio(ad.priceFloatingRatio || 0);
      try {
        await new Promise<void>((resolve, reject) => {
          updateAd.mutate({
            advNo: ad.advNo,
            asset: ad.asset,
            fiatUnit: ad.fiatUnit,
            tradeType: ad.tradeType,
            priceType: 2,
            initAmount: ad.initAmount,
            minSingleTransAmount: ad.minSingleTransAmount,
            maxSingleTransAmount: ad.maxSingleTransAmount,
            priceFloatingRatio: newRatio,
            tradeMethods: ad.tradeMethods,
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
          <DialogTitle>Bulk Floating Price Adjustment</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Adjust floating price ratio for <strong>{ads.length}</strong> floating ad{ads.length !== 1 ? 's' : ''}.
            </p>
            <div>
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'set' | 'adjust')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjust">Adjust by (+ or −)</SelectItem>
                  <SelectItem value="set">Set to exact value</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{mode === 'adjust' ? 'Adjustment (%)' : 'New Ratio (%)'}</Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={mode === 'adjust' ? 'e.g. +0.5 or -0.3' : 'e.g. 1.5'}
              />
              {mode === 'adjust' && (
                <p className="text-xs text-muted-foreground mt-1">Use positive to increase, negative to decrease</p>
              )}
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Confirm Bulk Floating Price Update</p>
                <p className="text-muted-foreground mt-1">
                  {mode === 'set'
                    ? `Set floating ratio to ${value}% for ${ads.length} ad(s)`
                    : `${Number(value) > 0 ? 'Increase' : 'Decrease'} floating ratio by ${value}% for ${ads.length} ad(s)`
                  }
                </p>
              </div>
            </div>
            <ScrollArea className="max-h-40">
              <div className="space-y-1">
                {ads.map(ad => (
                  <div key={ad.advNo} className="flex items-center justify-between text-xs px-1">
                    <span className="font-mono">…{ad.advNo.slice(-8)}</span>
                    <span>
                      {Number(ad.priceFloatingRatio || 0).toFixed(2)}% → <strong>{computeNewRatio(ad.priceFloatingRatio || 0).toFixed(2)}%</strong>
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
