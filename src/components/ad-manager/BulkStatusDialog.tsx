import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Power, PowerOff } from 'lucide-react';
import { BinanceAd, useUpdateAdStatus, BINANCE_AD_STATUS, getAdStatusLabel } from '@/hooks/useBinanceAds';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AdDialogHeader, NoteBox, RunProgress, RunRow, RunSummary, SelectionSummary } from './adUi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  targetStatus: number;
  onComplete: () => void;
}

type ResultStatus = 'pending' | 'success' | 'error';
interface AdResult { advNo: string; status: ResultStatus; message?: string }

export function BulkStatusDialog({ open, onOpenChange, ads: selectedAds, targetStatus, onComplete }: Props) {
  // Only ads not already in the target status need a Binance call.
  const ads = selectedAds.filter(ad => Number(ad.advStatus) !== Number(targetStatus));
  const alreadyCount = selectedAds.length - ads.length;
  const updateStatus = useUpdateAdStatus();
  const [step, setStep] = useState<'confirm' | 'executing' | 'done'>('confirm');
  const [results, setResults] = useState<AdResult[]>([]);

  const statusLabel = getAdStatusLabel(targetStatus);
  const actionVerb = targetStatus === BINANCE_AD_STATUS.ONLINE ? 'Activate' : 'Deactivate';

  const reset = () => { setStep('confirm'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const executeUpdates = async () => {
    setStep('executing');
    const initial: AdResult[] = ads.map(ad => ({ advNo: ad.advNo, status: 'pending' }));
    setResults(initial);

    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      try {
        await new Promise<void>((resolve, reject) => {
          updateStatus.mutate({ advNos: [ad.advNo], advStatus: targetStatus, exchangeAccountId: ad._exchangeAccountId }, {
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
        <AdDialogHeader
          icon={targetStatus === BINANCE_AD_STATUS.ONLINE ? Power : PowerOff}
          tone={targetStatus === BINANCE_AD_STATUS.ONLINE ? 'success' : 'destructive'}
          title={`${actionVerb} ads`}
          description={targetStatus === BINANCE_AD_STATUS.ONLINE ? 'Turns the selected ads on in Binance, one by one.' : 'Turns the selected ads off in Binance, one by one.'}
        />

        <SelectionSummary ads={selectedAds} label={`${selectedAds.length} selected`} />

        {step === 'confirm' && (
          <NoteBox tone={targetStatus === BINANCE_AD_STATUS.ONLINE ? 'info' : 'warning'} title={`${actionVerb} ${ads.length} ad${ads.length !== 1 ? 's' : ''} → ${statusLabel}`}>
            {alreadyCount > 0 && <>{alreadyCount} selected ad{alreadyCount !== 1 ? 's are' : ' is'} already {statusLabel} and will be skipped.</>}
          </NoteBox>
        )}

        {(step === 'executing' || step === 'done') && (
          <div className="space-y-2">
            {step === 'executing' && <RunProgress done={results.filter(r => r.status !== 'pending').length} total={results.length} label={`${actionVerb === 'Activate' ? 'Activating' : 'Deactivating'} ads…`} />}
            {step === 'done' && <RunSummary ok={successCount} failed={failCount} okText={`All ads ${actionVerb.toLowerCase()}d`} />}
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
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={executeUpdates} disabled={ads.length === 0}>{ads.length === 0 ? `Nothing to ${actionVerb.toLowerCase()}` : `${actionVerb} ${ads.length} ad${ads.length !== 1 ? 's' : ''}`}</Button>
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
