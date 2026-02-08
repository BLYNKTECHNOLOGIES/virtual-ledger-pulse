import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coffee, Play, Loader2 } from 'lucide-react';
import { useAdRestTimer } from '@/hooks/useAdRestTimer';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
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
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RestTimerBanner({ onlineAds }: Props) {
  const { isResting, remainingMs, activeTimer, startRest, endRest } = useAdRestTimer();
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
    startRest.mutate({ onlineAds });
  };

  const handleEndRest = () => {
    setConfirmEnd(false);
    endRest.mutate();
  };

  if (isResting) {
    return (
      <>
        <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <Coffee className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-foreground">Rest Mode Active</p>
              <p className="text-xs text-muted-foreground">
                Started by {activeTimer?.started_by || 'Operator'} · All ads are offline
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono text-lg border-amber-500/50 text-amber-600 px-3 py-1">
              {formatCountdown(countdown)}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmEnd(true)}
              disabled={endRest.isPending}
              className="border-success/50 text-success hover:bg-success/10"
            >
              {endRest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Resume Ads
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End Rest & Resume?</AlertDialogTitle>
              <AlertDialogDescription>
                This will re-activate {activeTimer?.deactivated_ad_nos?.length || 0} ads that were paused when rest started.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleEndRest}>Resume Ads</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmStart(true)}
        disabled={startRest.isPending || onlineAds.length === 0}
        title={onlineAds.length === 0 ? 'No online ads to pause' : 'Pause all ads for 1 hour'}
      >
        {startRest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Coffee className="h-4 w-4 mr-1.5" />}
        Take Rest
      </Button>

      <AlertDialog open={confirmStart} onOpenChange={setConfirmStart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take Rest?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate <strong>{onlineAds.length}</strong> online ad{onlineAds.length !== 1 ? 's' : ''} and start a 1-hour rest timer visible to all operators.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartRest}>Start Rest</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
