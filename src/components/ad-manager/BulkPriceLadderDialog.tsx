import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { useSpotIndexINR } from '@/hooks/useSpotIndexINR';
import { useHybridPriceAdjuster } from '@/hooks/useHybridPriceAdjuster';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  onComplete: () => void;
}

/** Fixed ladder step — one rung is 0.51 below the previous. */
export const LADDER_STEP = 0.51;

type ResultStatus = 'pending' | 'success' | 'error';

interface Rung {
  ad: BinanceAd;
  /** true = floating ad, ladder applies to priceFloatingRatio */
  floating: boolean;
  current: number;
  next: number;
  asset: string;
  side: string;
}

interface RungResult extends Rung {
  status: ResultStatus;
  message?: string;
}

interface LadderGroup {
  asset: string;
  side: string;
  /** live INR index price for this asset (spot × USDT/INR), or null when unavailable */
  index: number | null;
  /** fixed top rate for this group (scaled from the anchor asset) */
  topPrice: number | null;
  /** floating top expressed as a ratio, derived from topPrice + index */
  topRatio: number | null;
  rungs: Rung[];
  skipped?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Compact INR display — grouped digits, 2 dp (readable for BTC-sized numbers on mobile). */
const fmtINR = (n: number | null | undefined) =>
  n === null || n === undefined || isNaN(n)
    ? '—'
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const key = (asset: string, side: string) => `${asset}|${side}`;

/** Hybrid-Adjust conversion: fixed price → floating ratio for a given index. */
export function priceToRatio(price: number, index: number, adjuster: number) {
  const rawPct = ((price - index) / price) * 100;
  return round2(100 + rawPct - adjuster);
}

/**
 * Builds one ladder per asset+side group.
 * Fixed ads ladder on price from the group's top price; floating ads ladder on
 * ratio from the group's top ratio (converted from the same top price).
 */
export function buildLadderGroups(
  ads: BinanceAd[],
  anchorAsset: string,
  anchorTop: number,
  /** live INR index price per asset (spot × USDT/INR) */
  prices: Record<string, number | null>,
  adjuster: number,
): LadderGroup[] {
  const groups = new Map<string, BinanceAd[]>();
  ads.forEach((ad) => {
    const k = key(ad.asset, ad.tradeType);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(ad);
  });

  const out: LadderGroup[] = [];

  for (const [k, groupAds] of groups) {
    const [asset, side] = k.split('|');
    const index = prices[asset] ?? null;
    const anchorIndex = prices[anchorAsset] ?? null;

    const hasFloating = groupAds.some((a) => a.priceType === 2);
    const hasFixed = groupAds.some((a) => a.priceType !== 2);

    let topPrice: number | null = null;
    if (asset === anchorAsset) {
      topPrice = round2(anchorTop);
    } else if (index && anchorIndex) {
      topPrice = round2((anchorTop * index) / anchorIndex);
    }

    if (topPrice === null) {
      out.push({
        asset, side, index, topPrice: null, topRatio: null, rungs: [],
        skipped: 'No live index price for this asset — group skipped',
      });
      continue;
    }
    if (hasFloating && !index) {
      out.push({
        asset, side, index, topPrice, topRatio: null, rungs: [],
        skipped: 'No live index price — floating ratio cannot be derived, group skipped',
      });
      continue;
    }

    const topRatio = hasFloating && index ? priceToRatio(topPrice, index, adjuster) : null;

    const family = (floating: boolean, top: number) =>
      groupAds
        .filter((ad) => (ad.priceType === 2) === floating)
        .map((ad) => ({
          ad,
          floating,
          asset,
          side,
          current: floating ? Number(ad.priceFloatingRatio || 0) : Number(ad.price || 0),
        }))
        .sort((a, b) => b.current - a.current)
        .map((r, i) => ({ ...r, next: round2(top - i * LADDER_STEP) }));

    const rungs = [
      ...(hasFixed ? family(false, topPrice) : []),
      ...(hasFloating && topRatio !== null ? family(true, topRatio) : []),
    ];

    out.push({ asset, side, index, topPrice, topRatio, rungs });
  }

  return out.sort((a, b) => a.asset.localeCompare(b.asset) || a.side.localeCompare(b.side));
}

export function BulkPriceLadderDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const { data: adjuster = 0 } = useHybridPriceAdjuster();
  const [value, setValue] = useState('');
  const [anchorAsset, setAnchorAsset] = useState<string>('');
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<RungResult[]>([]);

  const assets = useMemo(() => [...new Set(ads.map((a) => a.asset))].sort(), [ads]);
  const defaultAnchor = useMemo(() => {
    const counts = new Map<string, number>();
    ads.forEach((a) => counts.set(a.asset, (counts.get(a.asset) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || assets[0] || '';
  }, [ads, assets]);
  const anchor = anchorAsset && assets.includes(anchorAsset) ? anchorAsset : defaultAnchor;

  const {
    index: prices,
    usdtInr,
    rateSource,
    rateIsFallback,
    isLoading: pricesLoading,
  } = useSpotIndexINR(assets, open);

  const top = Number(value);
  const groups = useMemo(
    () => (value && !isNaN(top) && top > 0 ? buildLadderGroups(ads, anchor, top, prices, adjuster) : []),
    [ads, value, top, anchor, prices, adjuster],
  );
  const ladder = useMemo(() => groups.flatMap((g) => g.rungs), [groups]);
  const invalidRung = ladder.find((r) => r.next <= 0);
  const skippedGroups = groups.filter((g) => g.skipped);

  const reset = () => { setValue(''); setStep('form'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const handleConfirm = () => {
    if (!value || isNaN(top) || top <= 0) {
      toast({ title: 'Top rate required', description: `Enter the fixed top rate for ${anchor}`, variant: 'destructive' });
      return;
    }
    if (invalidRung) {
      toast({
        title: 'Ladder goes below zero',
        description: `A rung on ${invalidRung.asset} would be ${invalidRung.next}. Raise the top rate or select fewer ads.`,
        variant: 'destructive',
      });
      return;
    }
    if (ladder.length === 0) {
      toast({ title: 'Nothing to apply', description: 'No group has a usable Binance reference price.', variant: 'destructive' });
      return;
    }
    setStep('confirm');
  };

  /** Applies one rung; resolves on success, throws on failure. */
  const applyRung = async (rung: Rung) => {
    const { ad, floating, current, next } = rung;
    const tradeMethods = (ad.tradeMethods || []).map((m) => ({
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
        priceType: floating ? 2 : 1,
        initAmount: ad.initAmount,
        surplusAmount: ad.surplusAmount,
        minSingleTransAmount: ad.minSingleTransAmount,
        maxSingleTransAmount: ad.maxSingleTransAmount,
        ...(floating
          ? { priceFloatingRatio: next, oldRatio: current }
          : { price: next, oldPrice: current }),
        tradeMethods,
        payTimeLimit: ad.payTimeLimit || 15,
      }, {
        onSuccess: () => resolve(),
        onError: (e) => reject(e),
      });
    });
  };

  /**
   * Multi-pass execution.
   * Binance rejects a price that overlaps another of our live ads — so a rung can
   * legitimately fail only because a LOWER rung hasn't moved out of the way yet.
   * We therefore run the whole ladder top-down, then keep re-attempting the failed
   * rungs in further passes (they usually clear once the blocking ad has moved).
   * Passes stop when nothing fails, or when a pass makes no progress at all.
   */
  const executeUpdates = async () => {
    setStep('executing');
    setResults(ladder.map((r) => ({ ...r, status: 'pending' })));

    let queue = ladder.map((_, i) => i);
    const MAX_PASSES = 4;

    for (let pass = 1; pass <= MAX_PASSES && queue.length > 0; pass++) {
      const stillFailing: number[] = [];

      for (let q = 0; q < queue.length; q++) {
        const i = queue[q];
        if (pass > 1 || q > 0) await new Promise((r) => setTimeout(r, 300));
        if (pass > 1) {
          setResults((prev) => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'pending', message: `Retry ${pass - 1}…` } : r));
        }
        try {
          await applyRung(ladder[i]);
          setResults((prev) => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'success', message: pass > 1 ? `OK on retry ${pass - 1}` : undefined } : r));
        } catch (e: any) {
          stillFailing.push(i);
          const msg = e?.message || 'Failed';
          setResults((prev) => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'error', message: msg } : r));
        }
      }

      // No progress this pass — further passes would repeat the same failures.
      if (stillFailing.length === queue.length && pass > 1) {
        queue = stillFailing;
        break;
      }
      queue = stillFailing;
    }

    setStep('done');
  };

  const successCount = results.filter((r) => r.status === 'success').length;
  const failCount = results.filter((r) => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Price Ladder</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Step <strong>{ads.length}</strong> selected ad{ads.length !== 1 ? 's' : ''} down in fixed {LADDER_STEP} increments,
              highest first — separately inside each asset + side group.
            </p>

            {assets.length > 1 && (
              <div>
                <Label>Anchor asset</Label>
                <Select value={anchor} onValueChange={setAnchorAsset}>
                  <SelectTrigger className="text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  The rate you enter belongs to this asset; other assets are scaled by their live spot index.
                </p>
              </div>
            )}

            <div>
              <Label>Top fixed rate ({anchor})</Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 100"
                autoFocus
                className="text-foreground"
              />
            </div>

            <p className={`text-xs ${rateIsFallback ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              Index base — USDT/INR ₹{usdtInr ? usdtInr.toFixed(2) : '—'}{rateSource ? ` (${rateSource})` : ''}
            </p>

            {pricesLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading live index prices…
              </p>
            )}

            {groups.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border">
                {groups.map((g) => (
                  <div key={`${g.asset}|${g.side}`} className="px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium">{g.asset} · {g.side}</span>
                      {!g.skipped && (
                        <span className="text-muted-foreground tabular-nums">
                          {g.rungs.length} rung{g.rungs.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {g.skipped ? (
                      <p className="text-destructive mt-0.5">{g.skipped}</p>
                    ) : (
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                        <span>Top: <span className="text-foreground">₹{fmtINR(g.topPrice)}</span></span>
                        {g.index !== null && <span>Index: <span className="text-foreground">₹{fmtINR(g.index)}</span></span>}
                        {g.topRatio !== null && (
                          <span className="col-span-2">Float top: <span className="text-foreground">{g.topRatio.toFixed(2)}%</span></span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {adjuster !== 0 && (
              <p className="text-xs text-muted-foreground">
                Hybrid price adjuster of {adjuster} is subtracted from every derived floating ratio.
              </p>
            )}

            {invalidRung && (
              <p className="text-xs text-destructive">
                This top rate takes a {invalidRung.asset} rung to {invalidRung.next}. Raise it or select fewer ads.
              </p>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Confirm Price Ladder</p>
                <p className="text-muted-foreground mt-1">
                  {ladder.length} ad(s) across {groups.filter((g) => !g.skipped).length} group(s) will be re-priced in {LADDER_STEP} steps.
                  {skippedGroups.length > 0 && ` ${skippedGroups.length} group(s) skipped — no index price.`}
                </p>
              </div>
            </div>
            <ScrollArea className="max-h-64">
              <div className="space-y-2 pr-1">
                {groups.filter((g) => !g.skipped).map((g) => (
                  <div key={`${g.asset}|${g.side}`} className="space-y-1">
                    <p className="text-xs font-semibold">
                      {g.asset} · {g.side} — top ₹{fmtINR(g.topPrice)}
                      {g.topRatio !== null && ` / ${g.topRatio.toFixed(2)}%`}
                    </p>
                    {g.rungs.map((r, i) => (
                      <div key={r.ad.advNo} className="flex items-center justify-between gap-2 text-[11px] px-1">
                        <span className="font-mono truncate">
                          {i + 1}. …{r.ad.advNo.slice(-6)}{r.floating ? ' float%' : ''}
                        </span>
                        <span className="tabular-nums whitespace-nowrap">
                          {fmtINR(r.current)} → <strong>{fmtINR(r.next)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <ScrollArea className="max-h-60">
            <div className="space-y-2 py-2 pr-1">
              {step === 'done' && (
                <p className="text-sm font-medium mb-2">
                  {failCount === 0 ? 'All ads re-priced' : `${successCount} succeeded, ${failCount} failed`}
                </p>
              )}
              {results.map((r) => (
                <div key={r.ad.advNo} className="flex items-start gap-2 text-xs">
                  {r.status === 'pending' && <Loader2 className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin text-muted-foreground" />}
                  {r.status === 'success' && <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-success" />}
                  {r.status === 'error' && <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono truncate">{r.asset} {r.side} …{r.ad.advNo.slice(-6)}</span>
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                        {fmtINR(r.current)} → {fmtINR(r.next)}
                      </span>
                    </div>
                    {r.message && <p className="text-destructive break-words">{r.message}</p>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={!!invalidRung || pricesLoading}>Next</Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={executeUpdates}>Confirm & Apply</Button>
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
