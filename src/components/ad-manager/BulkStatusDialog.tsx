import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { BinanceAd, useUpdateAdStatus, BINANCE_AD_STATUS, getAdStatusLabel } from '@/hooks/useBinanceAds';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  targetStatus: number;
  onComplete: () => void;
}

type ResultStatus = 'pending' | 'success' | 'error';
interface AdResult { advNo: string; status: ResultStatus; message?: string }

export function BulkStatusDialog({ open, onOpenChange, ads, targetStatus, onComplete }: Props) {
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

    // Binance updateAdStatus supports batch advNos, but we process individually
    // for granular error reporting per ad
    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      try {
        await new Promise<void>((resolve, reject) => {
          updateStatus.mutate({ advNos: [ad.advNo], advStatus: targetStatus }, {
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
          <DialogTitle>Bulk {actionVerb} Ads</DialogTitle>
        </DialogHeader>

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Confirm Bulk Status Change</p>
                <p className="text-muted-foreground mt-1">
                  {actionVerb} <strong>{ads.length}</strong> ad{ads.length !== 1 ? 's' : ''} → <strong>{statusLabel}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <ScrollArea className="max-h-60">
            <div className="space-y-2 py-2">
              {step === 'done' && (
                <p className="text-sm font-medium mb-2">
                  {failCount === 0 ? `✅ All ads ${actionVerb.toLowerCase()}d` : `⚠️ ${successCount} succeeded, ${failCount} failed`}
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
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={executeUpdates}>{actionVerb} {ads.length} Ad{ads.length !== 1 ? 's' : ''}</Button>
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
