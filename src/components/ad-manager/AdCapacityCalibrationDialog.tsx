import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Gauge, AlertTriangle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { BinanceAd } from '@/hooks/useBinanceAds';
import { adZone, AdZone, ZONE_SHORT } from '@/lib/adZone';
import { useAdCapacityMap, capacityKey, useRunCapacityProbe, useRunCapacitySweep } from '@/hooks/useAdCapacityLimits';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
}

interface Combo {
  key: string;
  accountId: string;
  asset: string;
  zone: AdZone;
  tradeType: 'BUY' | 'SELL';
  carrier: BinanceAd | null;
}

type SweepState = 'waiting' | 'running' | 'success' | 'error' | 'skipped';
interface SweepProgress { state: SweepState; message?: string }

const AD_STATUS_OFFLINE = 3;
const fmtQty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function AdCapacityCalibrationDialog({ open, onOpenChange, ads }: Props) {
  const { toast } = useToast();
  const { map, isLoading, refetch } = useAdCapacityMap();
  const probe = useRunCapacityProbe();
  const sweep = useRunCapacitySweep();
  const [upperBounds, setUpperBounds] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweepProgress, setSweepProgress] = useState<Record<string, SweepProgress>>({});
  const [sweepCount, setSweepCount] = useState({ completed: 0, total: 0 });

  const combos: Combo[] = useMemo(() => {
    const byKey = new Map<string, Combo>();
    ads.forEach((ad) => {
      const zone = adZone(ad);
      const accountId = ad._exchangeAccountId || '';
      const key = capacityKey(accountId, ad.asset, zone, ad.tradeType);
      const existing = byKey.get(key);
      const isOffline = Number(ad.advStatus) === AD_STATUS_OFFLINE;
      if (!existing) {
        byKey.set(key, { key, accountId, asset: ad.asset.toUpperCase(), zone, tradeType: ad.tradeType as 'BUY' | 'SELL', carrier: isOffline ? ad : null });
      } else if (!existing.carrier && isOffline) {
        existing.carrier = ad;
      }
    });
    return Array.from(byKey.values()).sort((a, b) => a.asset.localeCompare(b.asset) || a.zone.localeCompare(b.zone) || a.tradeType.localeCompare(b.tradeType));
  }, [ads]);

  const runSweep = async () => {
    const eligible = combos.filter((combo) => combo.carrier);
    setSweeping(true);
    setSweepCount({ completed: 0, total: eligible.length });
    setSweepProgress(Object.fromEntries(combos.map((combo) => [combo.key, combo.carrier
      ? { state: 'waiting' as const }
      : { state: 'skipped' as const, message: 'No offline carrier ad' }] )));
    let saved = 0;
    let failed = 0;

    try {
      for (let index = 0; index < eligible.length; index++) {
        const combo = eligible[index];
        setSweepProgress((current) => ({ ...current, [combo.key]: { state: 'running' } }));
        try {
          const res = await sweep.mutateAsync({
            exchange_account_id: combo.accountId || undefined,
            asset: combo.asset,
            zone: combo.zone,
            tradeType: combo.tradeType,
          });
          const result = res.results?.[0];
          const successful = Boolean(result?.saved || result?.skipped === 'already calibrated');
          if (successful) saved++; else failed++;
          setSweepProgress((current) => ({ ...current, [combo.key]: {
            state: successful ? 'success' : result?.skipped ? 'skipped' : 'error',
            message: result?.skipped || result?.abortReason || result?.error || (successful ? 'Calibrated' : 'No limit established'),
          } }));
        } catch (error) {
          failed++;
          setSweepProgress((current) => ({ ...current, [combo.key]: {
            state: 'error',
            message: error instanceof Error ? error.message : 'Calibration failed',
          } }));
        }
        setSweepCount({ completed: index + 1, total: eligible.length });
        await refetch();
      }
      toast({
        title: `Calibrated ${saved} of ${eligible.length} combinations`,
        description: failed ? `${failed} could not be established. The exact reason is shown on each affected row.` : 'All carrier ad quantities were restored.',
        variant: failed ? 'destructive' : undefined,
      });
    } finally {
      setSweeping(false);
    }
  };

  const runProbe = async (combo: Combo) => {
    if (!combo.carrier) return;
    const raw = upperBounds[combo.key];
    const upperBound = Number(raw);
    if (!raw || !Number.isFinite(upperBound) || upperBound <= 0) {
      toast({ title: 'Enter a search ceiling', description: 'Give an upper bound the probe should search below.', variant: 'destructive' });
      return;
    }
    setRunning(combo.key);
    try {
      const res = await probe.mutateAsync({ asset: combo.asset, zone: combo.zone, tradeType: combo.tradeType, carrierAdvNo: combo.carrier.advNo, exchange_account_id: combo.accountId || undefined, upperBound });
      if (res.restored === false) toast({ title: 'Carrier ad quantity not restored', description: res.restoreError || 'Check the carrier ad on Binance.', variant: 'destructive' });
      else if (res.maxAccepted != null) toast({ title: 'Calibrated', description: `${combo.asset} ${combo.tradeType} ${ZONE_SHORT[combo.zone]} max ${fmtQty(res.maxAccepted)}` });
      else toast({ title: 'No limit found', description: res.abortReason || 'Binance rejected every probe value.', variant: 'destructive' });
      refetch();
    } catch (error) {
      toast({ title: 'Probe failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Ad Quantity Capacity</DialogTitle>
          <DialogDescription>Maximum publishable quantity per asset, zone and side, measured using an offline carrier ad.</DialogDescription>
        </DialogHeader>

        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <ScrollArea className="max-h-[26rem] pr-2">
            <div className="space-y-2 py-1">
              {combos.length === 0 && <p className="text-sm text-muted-foreground">No ads loaded.</p>}
              {sweeping && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3" role="status" aria-live="polite">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin" /> Calibrating ad limits</span>
                    <span className="font-mono text-xs">{sweepCount.completed}/{sweepCount.total}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${sweepCount.total ? (sweepCount.completed / sweepCount.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
              {combos.map((combo) => {
                const row = map.get(combo.key);
                const busy = running === combo.key;
                const progress = sweepProgress[combo.key];
                return (
                  <div key={combo.key} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{combo.asset}</span>
                        <Badge variant="outline" className="text-[10px]">{combo.tradeType}</Badge>
                        <Badge variant="outline" className="text-[10px]">{ZONE_SHORT[combo.zone]}</Badge>
                        {row?.needs_recalibration && <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">Needs re-calibration</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span>
                          {row?.max_accepted_qty != null
                            ? <span className="font-medium">Max {fmtQty(row.max_accepted_qty)} <span className="text-xs text-muted-foreground">({row.source})</span></span>
                            : <span className="text-xs text-muted-foreground">Not calibrated</span>}
                        </span>
                        {progress?.state === 'running' ? <span className="flex items-center gap-1.5 text-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…</span>
                          : progress?.state === 'success' ? <span className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Done</span>
                          : progress?.state === 'error' ? <span className="flex items-center gap-1.5 text-xs text-destructive"><XCircle className="h-3.5 w-3.5" /> Failed</span>
                          : progress?.state === 'waiting' ? <span className="text-xs text-muted-foreground">Waiting…</span>
                          : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input inputMode="decimal" placeholder="Search ceiling" value={upperBounds[combo.key] ?? ''} onChange={(event) => setUpperBounds((current) => ({ ...current, [combo.key]: event.target.value }))} className="h-8 w-40 text-foreground" disabled={!combo.carrier || busy || sweeping} />
                      <Button size="sm" variant="outline" onClick={() => runProbe(combo)} disabled={!combo.carrier || busy || sweeping}>
                        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                        {row ? 'Re-probe' : 'Probe'}
                      </Button>
                      {!combo.carrier && <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Needs an offline ad for this combo</span>}
                      {row?.min_rejected_qty != null && <span className="text-xs text-muted-foreground">rejected at {fmtQty(row.min_rejected_qty)}</span>}
                    </div>
                    {row?.binance_error_message && <p className="mt-1 truncate text-xs text-muted-foreground">Binance: {row.binance_error_message}</p>}
                    {progress?.message && progress.state !== 'success' && <p className={`mt-1 text-xs ${progress.state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{progress.message}</p>}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="secondary" onClick={runSweep} disabled={sweeping || combos.every((combo) => !combo.carrier)}>
            {sweeping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gauge className="mr-2 h-4 w-4" />}
            {sweeping ? `Calibrating ${sweepCount.completed}/${sweepCount.total}` : 'Auto-calibrate all'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sweeping}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
