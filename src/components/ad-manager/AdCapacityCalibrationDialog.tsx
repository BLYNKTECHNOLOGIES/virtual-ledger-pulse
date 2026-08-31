import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Gauge, AlertTriangle, RefreshCw } from 'lucide-react';
import { BinanceAd } from '@/hooks/useBinanceAds';
import { adZone, AdZone, ZONE_SHORT } from '@/lib/adZone';
import { useAdCapacityMap, capacityKey, useRunCapacityProbe, useRunCapacitySweep } from '@/hooks/useAdCapacityLimits';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every ad currently loaded — used to find an offline carrier ad per combo. */
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

const AD_STATUS_OFFLINE = 3;
const fmtQty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function AdCapacityCalibrationDialog({ open, onOpenChange, ads }: Props) {
  const { toast } = useToast();
  const { map, isLoading, refetch } = useAdCapacityMap();
  const probe = useRunCapacityProbe();
  const [upperBounds, setUpperBounds] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const sweep = useRunCapacitySweep();
  const [sweeping, setSweeping] = useState(false);

  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const runSweep = async () => {
    setSweeping(true);
    setProgress({ current: 0, total: combos.length });
    try {
      let currentDeferred = 0;
      let totalSaved = 0;
      let allFailed: any[] = [];
      const accountId = combos[0]?.accountId || undefined;

      for (let round = 0; round < 10; round++) {
        const res = await sweep.mutateAsync({ exchange_account_id: accountId });
        const saved = (res.results || []).filter((r) => r.saved).length;
        const failed = (res.results || []).filter((r) => r.error || r.abortReason);
        
        totalSaved += saved;
        allFailed.push(...failed);
        
        const doneCount = (res.results || []).filter(r => !r.skipped || r.skipped !== "deferred to next run (time budget)").length;
        setProgress(prev => prev ? { ...prev, current: Math.min(prev.current + doneCount, combos.length) } : null);

        if (!res.deferred) break;
        refetch(); // Refresh background data between rounds
      }

      toast({
        title: `Calibrated ${totalSaved} of ${combos.length} combinations`,
        description: allFailed.length ? `${allFailed.length} could not be established.` : 'Carrier ad quantities restored.',
        variant: allFailed.length ? 'destructive' : undefined,
      });
      refetch();
    } catch (e: any) {
      console.error('Sweep failed:', e);
      toast({ title: 'Auto-calibration failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSweeping(false);
      setProgress(null);
    }
  };

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
      const res = await probe.mutateAsync({
        asset: combo.asset,
        zone: combo.zone,
        tradeType: combo.tradeType,
        carrierAdvNo: combo.carrier.advNo,
        exchange_account_id: combo.accountId || undefined,
        upperBound,
      });
      if (res.restored === false) {
        toast({ title: 'Carrier ad quantity not restored', description: res.restoreError || 'Check the carrier ad on Binance.', variant: 'destructive' });
      } else if (res.maxAccepted != null) {
        toast({ title: 'Calibrated', description: `${combo.asset} ${combo.tradeType} ${ZONE_SHORT[combo.zone]} max ${fmtQty(res.maxAccepted)}` });
      } else {
        toast({ title: 'No limit found', description: res.abortReason || 'Binance rejected every probe value.', variant: 'destructive' });
      }
      refetch();
    } catch (e: any) {
      toast({ title: 'Probe failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Ad Quantity Capacity</DialogTitle>
          <DialogDescription>
            Maximum publishable ad quantity per asset, zone and side — discovered empirically by probing an offline carrier ad. Binance exposes no endpoint that reports these caps, so nothing here is assumed: a row stays blank until a probe or a real rejection fills it.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <ScrollArea className="max-h-[26rem] pr-2">
            <div className="space-y-2 py-1">
              {combos.length === 0 && <p className="text-sm text-muted-foreground">No ads loaded.</p>}
              {combos.map((c) => {
                const row = map.get(c.key);
                const busy = running === c.key;
                return (
                  <div key={c.key} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{c.asset}</span>
                        <Badge variant="outline" className="text-[10px]">{c.tradeType}</Badge>
                        <Badge variant="outline" className="text-[10px]">{ZONE_SHORT[c.zone]}</Badge>
                        {row?.needs_recalibration && (
                          <Badge variant="outline" className="text-[10px] text-warning border-warning/40">Needs re-calibration</Badge>
                        )}
                      </div>
                      <div className="text-sm">
                        {row?.max_accepted_qty != null ? (
                          <span className="font-medium">{fmtQty(row.max_accepted_qty)} <span className="text-xs text-muted-foreground">({row.source})</span></span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not calibrated</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        inputMode="decimal"
                        placeholder="Search ceiling"
                        value={upperBounds[c.key] ?? ''}
                        onChange={(e) => setUpperBounds((p) => ({ ...p, [c.key]: e.target.value }))}
                        className="h-8 w-40 text-foreground"
                        disabled={!c.carrier || busy}
                      />
                      <Button size="sm" variant="outline" onClick={() => runProbe(c)} disabled={!c.carrier || busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          <div className="flex flex-col gap-1">
            <Button variant="secondary" onClick={runSweep} disabled={sweeping}>
              {sweeping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gauge className="h-4 w-4 mr-2" />}
              {sweeping ? 'Calibrating…' : 'Auto-calibrate all'}
            </Button>
            {sweeping && progress && (
              <div className="text-[10px] text-muted-foreground text-center">
                {progress.current} / {progress.total} processed
              </div>
            )}
          </div>
                          <AlertTriangle className="h-3.5 w-3.5" /> Needs an offline ad for this combo to probe with
                        </span>
                      )}
                      {row?.min_rejected_qty != null && (
                        <span className="text-xs text-muted-foreground">rejected at {fmtQty(row.min_rejected_qty)}</span>
                      )}
                    </div>
                    {row?.binance_error_message && (
                      <p className="mt-1 text-xs text-muted-foreground truncate">Binance: {row.binance_error_message}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-col gap-1">
            <Button variant="secondary" onClick={runSweep} disabled={sweeping}>
              {sweeping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gauge className="h-4 w-4 mr-2" />}
              {sweeping ? 'Calibrating…' : 'Auto-calibrate all'}
            </Button>
            {sweeping && progress && (
              <div className="text-[10px] text-muted-foreground text-center">
                {progress.current} / {progress.total} processed
              </div>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
