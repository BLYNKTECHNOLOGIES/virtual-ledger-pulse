import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Coffee, Play, Loader2, OctagonPause } from 'lucide-react';
import { useAdRestTimer } from '@/hooks/useAdRestTimer';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  onlineAds: BinanceAd[];
  activeAds: BinanceAd[];
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RestTimerBanner({ onlineAds, activeAds }: Props) {
  const { isResting, isBinanceBreakDetected, detectedBreak, remainingMs, activeTimer, startRest, endRest, clearDetectedBreak } = useAdRestTimer();
  const [countdown, setCountdown] = useState(remainingMs);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Live countdown tick
  useEffect(() => {
    setCountdown(remainingMs);
    if (!isResting) return;
    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isResting, remainingMs]);

  const handleStartRest = () => {
    setConfirmStart(false);
    startRest.mutate({ activeAds });
  };

  const handleEndRest = () => {
    setConfirmEnd(false);
    endRest.mutate();
  };

  if (isResting) {
    return (
      <>
        <div role="status" className="order-first flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-warning/30 bg-warning/15">
              <Coffee className="h-4 w-4 text-warning" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Rest mode is on — all ads are offline</div>
              <div className="text-xs text-muted-foreground">
                Started by {activeTimer?.started_by || 'Operations Associate'} · ads stay off when the timer ends — press Resume ads to switch them back on
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="t-mono rounded-md border border-warning/40 bg-card px-2.5 py-1 text-lg font-semibold tabular-nums text-warning" aria-label="Time left">
              {formatCountdown(countdown)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmEnd(true)}
              disabled={endRest.isPending}
              className="h-9 border-success/50 text-success hover:bg-success/10 hover:text-success"
            >
              {endRest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Resume ads
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>End the rest and resume ads?</AlertDialogTitle>
              <AlertDialogDescription>
                This turns back on the <strong className="text-foreground">{activeTimer?.deactivated_ad_nos?.length || 0}</strong> ads that were switched off when the rest started.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleEndRest}>Resume ads</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (isBinanceBreakDetected) {
    return (
      <div role="alert" className="order-first flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/15">
            <OctagonPause className="h-4 w-4 text-destructive" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Binance break is on</div>
            <div className="text-xs text-muted-foreground">
              Binance is blocking ad changes because the merchant account is taking a break.
              {detectedBreak?.detectedAt ? ` Detected ${format(new Date(detectedBreak.detectedAt), 'dd MMM HH:mm')}.` : ''}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={clearDetectedBreak}>
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setConfirmStart(true)}
        disabled={startRest.isPending || activeAds.length === 0}
        title={activeAds.length === 0 ? 'No active ads to pause' : 'Pause all ads for 1 hour'}
      >
        {startRest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coffee className="h-3.5 w-3.5" />}
        Take rest
      </Button>

      <AlertDialog open={confirmStart} onOpenChange={setConfirmStart}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Take a rest?</AlertDialogTitle>
            <AlertDialogDescription>
              This switches off <strong className="text-foreground">{activeAds.length}</strong> active ad{activeAds.length !== 1 ? 's' : ''} (including Private) and starts a 1-hour rest timer that every operator sees.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartRest}>Start rest</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
