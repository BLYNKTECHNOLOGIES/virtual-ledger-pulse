import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Percent } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { zonesOf } from '@/lib/adZone';
import { AdDialogHeader, NoteBox, RunProgress, RunRow, RunSummary, SelectionSummary, StepRail, shortAdNo } from './adUi';

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
            exchange_account_id: ad._exchangeAccountId,
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
        <AdDialogHeader icon={Percent} title="Set floating ratio" description="Every selected floating ad gets exactly this ratio." />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SelectionSummary ads={ads} />
          <StepRail steps={['Set', 'Review', 'Apply']} current={step === 'form' ? 0 : step === 'confirm' ? 1 : 2} />
        </div>

        {step === 'form' && (
          <div className="space-y-3">
            {zonesOf(ads as any).length > 1 && (
              <NoteBox title="Mixed zones">
                Your selection mixes <strong>P2P zone</strong> and <strong>Block zone</strong> ads. These are separate
                order books with different price levels — one shared ratio will misprice at least one zone.
              </NoteBox>
            )}

            <div className="space-y-1.5">
              <Label>New Floating Ratio (%)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="e.g. 103.5"
                  autoFocus
                  className="pr-8 text-base font-semibold tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <div className="text-xs text-muted-foreground">
                All selected ads will be set to exactly this ratio — the current ratio is replaced, not added to.
              </div>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-2">
            <NoteBox title={`Set ${ads.length} ad${ads.length !== 1 ? 's' : ''} to ${value}%?`}>
              Current ratios will be replaced.
            </NoteBox>
            <ScrollArea className="max-h-44 rounded-md border border-border">
              <div className="p-1">
                {ads.map(ad => (
                  <div key={ad.advNo} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs odd:bg-secondary/40">
                    <span className="flex items-center gap-1.5"><span className="font-medium text-foreground">{ad.asset}</span><span className="t-mono text-muted-foreground">{shortAdNo(ad.advNo)}</span></span>
                    <span className="tabular-nums text-muted-foreground">
                      {Number(ad.priceFloatingRatio || 0).toFixed(2)}% → <strong className="text-foreground">{getNewRatio().toFixed(2)}%</strong>
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <div className="space-y-2">
            {step === 'executing' && <RunProgress done={results.filter(r => r.status !== 'pending').length} total={results.length} label="Updating floating ratios…" />}
            {step === 'done' && <RunSummary ok={successCount} failed={failCount} okText="All ads updated" />}
            <ScrollArea className="max-h-60 rounded-md border border-border">
              <div className="p-1">
                {results.map(r => (
                  <RunRow key={r.advNo} status={r.status} advNo={r.advNo} change={`${Number(r.oldRatio || 0).toFixed(2)}% → ${Number(r.newRatio || 0).toFixed(2)}%`} message={r.message} />
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
