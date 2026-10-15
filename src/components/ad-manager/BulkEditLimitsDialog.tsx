import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Edit } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AdDialogHeader, NoteBox, RunProgress, RunRow, RunSummary, SelectionSummary, StepRail, inr } from './adUi';

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

  const hasMin = min !== '' && !isNaN(Number(min));
  const hasMax = max !== '' && !isNaN(Number(max));

  const validate = (): string | null => {
    if (!hasMin && !hasMax) return 'Enter at least one of min or max order limit';
    if (hasMin && Number(min) <= 0) return 'Min order limit must be greater than 0';
    if (hasMax && Number(max) <= 0) return 'Max order limit must be greater than 0';
    if (hasMin && hasMax && Number(min) >= Number(max)) return 'Min must be less than max';
    // Cross-check against each ad's existing untouched side
    if (hasMin && !hasMax) {
      const bad = ads.find(a => Number(a.maxSingleTransAmount) <= Number(min));
      if (bad) return `Min ₹${Number(min).toLocaleString('en-IN')} is not below the existing max of ad …${bad.advNo.slice(-8)}`;
    }
    if (hasMax && !hasMin) {
      const bad = ads.find(a => Number(a.minSingleTransAmount) >= Number(max));
      if (bad) return `Max ₹${Number(max).toLocaleString('en-IN')} is not above the existing min of ad …${bad.advNo.slice(-8)}`;
    }
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
            exchange_account_id: ad._exchangeAccountId,
            asset: ad.asset,
            fiatUnit: ad.fiatUnit,
            tradeType: ad.tradeType,
            priceType: ad.priceType,
            initAmount: ad.initAmount,
            surplusAmount: ad.surplusAmount,
            minSingleTransAmount: hasMin ? Number(min) : Number(ad.minSingleTransAmount),
            maxSingleTransAmount: hasMax ? Number(max) : Number(ad.maxSingleTransAmount),
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
        <AdDialogHeader icon={Edit} title="Edit order limits" description="Set a new minimum and/or maximum order for every selected ad." />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SelectionSummary ads={ads} />
          <StepRail steps={['Set', 'Review', 'Apply']} current={step === 'form' ? 0 : step === 'confirm' ? 1 : 2} />
        </div>

        {step === 'form' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Order (₹)</Label>
                <Input type="number" value={min} onChange={e => setMin(e.target.value)} placeholder="e.g. 500" className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label>Max Order (₹)</Label>
                <Input type="number" value={max} onChange={e => setMax(e.target.value)} placeholder="e.g. 50000" className="tabular-nums" />
              </div>
            </div>
            <NoteBox tone="info">
              Fill only one field to change just that side — the other side stays exactly as it is on each ad.
            </NoteBox>
          </div>
        )}

        {step === 'confirm' && (
          <NoteBox title={`Update ${ads.length} ad${ads.length !== 1 ? 's' : ''}?`}>
            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span>Min order</span>
              <span className="font-medium text-foreground tabular-nums">{hasMin ? inr(min) : 'unchanged'}</span>
              <span>Max order</span>
              <span className="font-medium text-foreground tabular-nums">{hasMax ? inr(max) : 'unchanged'}</span>
            </div>
          </NoteBox>
        )}

        {(step === 'executing' || step === 'done') && (
          <div className="space-y-2">
            {step === 'executing' && <RunProgress done={results.filter(r => r.status !== 'pending').length} total={results.length} label="Updating order limits…" />}
            {step === 'done' && <RunSummary ok={successCount} failed={failCount} okText="All ads updated" />}
            <ScrollArea className="max-h-60 rounded-md border border-border">
              <div className="p-1">
                {results.map(r => (
                  <RunRow key={r.advNo} status={r.status} advNo={r.advNo} message={r.message} />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleConfirm} className="gap-1.5">Review <ArrowRight className="h-3.5 w-3.5" /></Button>
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
