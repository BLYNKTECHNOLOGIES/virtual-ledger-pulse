import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowDownWideNarrow, ArrowRight, Info } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { AdZone, adZone, ZONE_SHORT } from '@/lib/adZone';
import { useSpotIndexINR } from '@/hooks/useSpotIndexINR';
import { useHybridPriceAdjuster } from '@/hooks/useHybridPriceAdjuster';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AdDialogHeader, CHIP_MUTED, NoteBox, RunProgress, RunRow, RunSummary, SEG_BTN, SEG_LIST, SelectionSummary, SideChip, StepRail, shortAdNo } from './adUi';
import { cn } from '@/lib/utils';


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
  zone: AdZone;
}

interface RungResult extends Rung {
  status: ResultStatus;
  message?: string;
}

interface LadderGroup {
  asset: string;
  side: string;
  /** Market zone this group trades in — P2P and Block are separate books. */
  zone: AdZone;
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
const key = (asset: string, side: string, zone: AdZone) => `${asset}|${side}|${zone}`;


/** Hybrid-Adjust conversion: fixed price → floating ratio for a given index. */
export function priceToRatio(price: number, index: number, adjuster: number) {
  const rawPct = ((price - index) / price) * 100;
  return round2(100 + rawPct - adjuster);
}

/** Exact inverse of priceToRatio: floating ratio → fixed price for a given index. */
export function ratioToPrice(ratio: number, index: number, adjuster: number): number | null {
  const rawPct = ratio + adjuster - 100;
  const denom = 1 - rawPct / 100;
  if (!isFinite(denom) || denom <= 0) return null;
  const price = index / denom;
  return isFinite(price) && price > 0 ? round2(price) : null;
}

export type LadderMode = 'fixed' | 'ratio';


/**
 * Builds one ladder per asset + side + zone group.
 * Zone matters because the P2P zone and the Block zone are separate order books
 * that trade at different price levels — they are never merged into one ladder.
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
  mode: LadderMode = 'fixed',
): LadderGroup[] {
  const groups = new Map<string, BinanceAd[]>();
  ads.forEach((ad) => {
    const k = key(ad.asset, ad.tradeType, adZone(ad));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(ad);
  });

  const out: LadderGroup[] = [];

  for (const [k, groupAds] of groups) {
    const [asset, side, zoneKey] = k.split('|');
    const zone = zoneKey as AdZone;
    const index = prices[asset] ?? null;
    const anchorIndex = prices[anchorAsset] ?? null;

    const hasFloating = groupAds.some((a) => a.priceType === 2);
    const hasFixed = groupAds.some((a) => a.priceType !== 2);

    let topPrice: number | null = null;
    let topRatio: number | null = null;

    if (mode === 'ratio') {
      // The entered value is a market-relative ratio — it applies to every group as-is.
      topRatio = hasFloating ? round2(anchorTop) : null;
      if (hasFixed) {
        if (!index) {
          out.push({
            asset, side, zone, index, topPrice: null, topRatio, rungs: [],
            skipped: 'No live index price — fixed top price cannot be derived, group skipped',
          });
          continue;
        }
        topPrice = ratioToPrice(anchorTop, index, adjuster);
        if (topPrice === null) {
          out.push({
            asset, side, zone, index, topPrice: null, topRatio, rungs: [],
            skipped: 'Ratio is out of range for this index — no valid fixed price, group skipped',
          });
          continue;
        }
      }
    } else {
      if (asset === anchorAsset) {
        topPrice = round2(anchorTop);
      } else if (index && anchorIndex) {
        topPrice = round2((anchorTop * index) / anchorIndex);
      }

      if (topPrice === null) {
        out.push({
          asset, side, zone, index, topPrice: null, topRatio: null, rungs: [],
          skipped: 'No live index price for this asset — group skipped',
        });
        continue;
      }
      if (hasFloating && !index) {
        out.push({
          asset, side, zone, index, topPrice, topRatio: null, rungs: [],
          skipped: 'No live index price — floating ratio cannot be derived, group skipped',
        });
        continue;
      }

      topRatio = hasFloating && index ? priceToRatio(topPrice, index, adjuster) : null;

      // Sanity guard: a fixed top that is wildly off this asset's own index produces
      // absurd floating ratios (e.g. -64,656%). That is always an input mistake —
      // usually a rate entered against the wrong anchor asset.
      if (topRatio !== null && (topRatio < 50 || topRatio > 150)) {
        out.push({
          asset, side, zone, index, topPrice, topRatio, rungs: [],
          skipped: `Top ₹${topPrice} is far off this asset's live index — the derived floating ratio would be ${topRatio.toFixed(2)}%. Check the anchor asset, or use Floating ratio (%) mode.`,
        });
        continue;
      }
    }



    const family = (floating: boolean, top: number) =>
      groupAds
        .filter((ad) => (ad.priceType === 2) === floating)
        .map((ad) => ({
          ad,
          floating,
          asset,
          side,
          zone,
          current: floating ? Number(ad.priceFloatingRatio || 0) : Number(ad.price || 0),
        }))
        .sort((a, b) => b.current - a.current)
        .map((r, i) => ({ ...r, next: round2(top - i * LADDER_STEP) }));

    const rungs = [
      ...(hasFixed && topPrice !== null ? family(false, topPrice) : []),
      ...(hasFloating && topRatio !== null ? family(true, topRatio) : []),
    ];


    out.push({ asset, side, zone, index, topPrice, topRatio, rungs });
  }

  return out.sort((a, b) =>
    a.asset.localeCompare(b.asset) || a.side.localeCompare(b.side) || a.zone.localeCompare(b.zone));
}


export function BulkPriceLadderDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const { data: adjuster = 0 } = useHybridPriceAdjuster();
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<LadderMode>('fixed');
  const [anchorAsset, setAnchorAsset] = useState<string>('');
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<RungResult[]>([]);


  const assets = useMemo(() => [...new Set(ads.map((a) => a.asset))].sort(), [ads]);
  const hasFixedAds = useMemo(() => ads.some((a) => a.priceType !== 2), [ads]);
  const defaultAnchor = useMemo(() => {
    // Prefer a stablecoin anchor — an INR rate entered against BTC/BNB-sized
    // indices is almost always a mistake.
    const stable = ['USDT', 'USDC', 'FDUSD'].find((s) => assets.includes(s));
    if (stable) return stable;
    const counts = new Map<string, number>();
    ads.forEach((a) => counts.set(a.asset, (counts.get(a.asset) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || assets[0] || '';
  }, [ads, assets]);
  const anchor = anchorAsset && assets.includes(anchorAsset) ? anchorAsset : defaultAnchor;

  // With no fixed ads in the selection there is no INR rate to anchor on —
  // the ladder can only be driven by a floating ratio.
  const effectiveMode: LadderMode = hasFixedAds ? mode : 'ratio';

  const {
    index: prices,
    usdtInr,
    rateSource,
    rateIsFallback,
    isLoading: pricesLoading,
  } = useSpotIndexINR(assets, open);

  const top = Number(value);
  const groups = useMemo(
    () => (value && !isNaN(top) && top > 0 ? buildLadderGroups(ads, anchor, top, prices, adjuster, effectiveMode) : []),
    [ads, value, top, anchor, prices, adjuster, effectiveMode],
  );
  const ladder = useMemo(() => groups.flatMap((g) => g.rungs), [groups]);
  const invalidRung = ladder.find((r) => r.next <= 0);
  const skippedGroups = groups.filter((g) => g.skipped);

  const reset = () => { setValue(''); setMode('fixed'); setStep('form'); setResults([]); };



  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const handleConfirm = () => {
    if (!value || isNaN(top) || top <= 0) {
      toast({
        title: effectiveMode === 'ratio' ? 'Top ratio required' : 'Top rate required',
        description: effectiveMode === 'ratio' ? 'Enter the top floating ratio (%)' : `Enter the fixed top rate for ${anchor}`,
        variant: 'destructive',
      });
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
      <DialogContent className="max-w-xl w-[calc(100vw-1.5rem)] sm:w-full max-h-[88vh] overflow-y-auto">
        <AdDialogHeader
          icon={ArrowDownWideNarrow}
          title="Price ladder"
          description={<>Steps the selected ads down {LADDER_STEP} at a time from a top rate, highest first, inside each asset · side · zone group (P2P and Block zones are separate books).</>}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SelectionSummary ads={ads} />
          <StepRail steps={['Set', 'Review', 'Apply']} current={step === 'form' ? 0 : step === 'confirm' ? 1 : 2} />
        </div>

        {step === 'form' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Ladder input</Label>
              <div className={cn(SEG_LIST, 'flex h-9 w-full items-center')} role="group" aria-label="Ladder input">
                <button
                  type="button"
                  aria-pressed={effectiveMode === 'fixed'}
                  disabled={!hasFixedAds}
                  title={!hasFixedAds ? 'No fixed-price ads selected — enter a floating ratio instead' : undefined}
                  onClick={() => setMode('fixed')}
                  className={cn(SEG_BTN, 'h-8 flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50')}
                >
                  Fixed rate (INR)
                </button>
                <button
                  type="button"
                  aria-pressed={effectiveMode === 'ratio'}
                  onClick={() => setMode('ratio')}
                  className={cn(SEG_BTN, 'h-8 flex-1 justify-center')}
                >
                  Floating ratio (%)
                </button>
              </div>
            </div>

            <div className={cn('grid gap-3', effectiveMode === 'fixed' && assets.length > 1 ? 'sm:grid-cols-[10rem_1fr]' : 'grid-cols-1')}>
              {effectiveMode === 'fixed' && assets.length > 1 && (
                <div className="space-y-1.5">
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
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{effectiveMode === 'ratio' ? 'Top floating ratio (%)' : `Top fixed rate (${anchor})`}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={effectiveMode === 'ratio' ? 'e.g. 103.20' : 'e.g. 100'}
                  autoFocus
                  className="text-base font-semibold tabular-nums text-foreground"
                />
              </div>
            </div>
            <div className="-mt-2 space-y-1 text-xs text-muted-foreground">
              {effectiveMode === 'fixed' && assets.length > 1 && (
                <div>The rate you enter belongs to the anchor asset; other assets are scaled by their live spot index.</div>
              )}
              <div>
                {effectiveMode === 'ratio'
                  ? 'Applies as the top rung to every group; fixed ads get the equivalent price from their live index.'
                  : 'Floating ads get the equivalent ratio derived from their live index.'}
              </div>
            </div>

            <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed', rateIsFallback ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-secondary/40 text-muted-foreground')}>
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <div className={rateIsFallback ? 'font-medium' : undefined}>
                  Index base — USDT/INR <span className="font-semibold tabular-nums text-foreground">₹{usdtInr ? usdtInr.toFixed(2) : '—'}</span>{rateSource ? ` (${rateSource})` : ''}
                </div>
                {adjuster !== 0 && <div>Hybrid adjuster {adjuster} is subtracted from every derived floating ratio.</div>}
                {pricesLoading && (
                  <div className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading live index prices…</div>
                )}
              </div>
            </div>

            {groups.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-border bg-secondary/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>Group</span><span>Top rung</span>
                </div>
                <div className="divide-y divide-border">
                  {groups.map((g) => (
                    <div key={`${g.asset}|${g.side}|${g.zone}`} className="px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">{g.asset}</span>
                          <SideChip side={g.side} />
                          <span className={CHIP_MUTED}>{ZONE_SHORT[g.zone]}</span>
                          {!g.skipped && <span className="text-muted-foreground tabular-nums">{g.rungs.length} rung{g.rungs.length !== 1 ? 's' : ''}</span>}
                        </span>
                        {!g.skipped && (
                          <span className="text-right tabular-nums">
                            {g.topPrice !== null && <span className="font-semibold text-foreground">₹{fmtINR(g.topPrice)}</span>}
                            {g.topRatio !== null && <span className="ml-2 text-muted-foreground">{g.topRatio.toFixed(2)}%</span>}
                          </span>
                        )}
                      </div>
                      {g.skipped ? (
                        <div className="mt-1 text-destructive">{g.skipped}</div>
                      ) : g.index !== null ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">Index ₹{fmtINR(g.index)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invalidRung && (
              <NoteBox tone="destructive" title="Ladder goes below zero">
                This top rate takes a {invalidRung.asset} rung to {invalidRung.next}. Raise it or select fewer ads.
              </NoteBox>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3">
            <NoteBox title={`Re-price ${ladder.length} ad${ladder.length !== 1 ? 's' : ''}?`}>
              {ladder.length} ad(s) across {groups.filter((g) => !g.skipped).length} group(s) will be re-priced in {LADDER_STEP} steps.
              {skippedGroups.length > 0 && ` ${skippedGroups.length} group(s) skipped — no index price.`}
            </NoteBox>
            <ScrollArea className="max-h-72 rounded-md border border-border">
              <div className="divide-y divide-border">
                {groups.filter((g) => !g.skipped).map((g) => (
                  <div key={`${g.asset}|${g.side}|${g.zone}`} className="space-y-1 p-2">
                    <div className="flex items-center justify-between gap-2 px-1 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{g.asset}</span>
                        <SideChip side={g.side} />
                        <span className={CHIP_MUTED}>{ZONE_SHORT[g.zone]}</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        top ₹{fmtINR(g.topPrice)}{g.topRatio !== null && ` / ${g.topRatio.toFixed(2)}%`}
                      </span>
                    </div>

                    {g.rungs.map((r, i) => (
                      <div key={r.ad.advNo} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[11px] odd:bg-secondary/40">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                          <span className="t-mono truncate text-foreground">{shortAdNo(r.ad.advNo, 6)}</span>
                          {r.floating && <span className={CHIP_MUTED}>float %</span>}
                        </span>
                        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                          {fmtINR(r.current)} → <strong className="text-foreground">{fmtINR(r.next)}</strong>
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
          <div className="space-y-2">
            {step === 'executing' && <RunProgress done={results.filter((r) => r.status === 'success').length} total={results.length} label="Re-pricing the ladder… (failed rungs are retried)" />}
            {step === 'done' && <RunSummary ok={successCount} failed={failCount} okText="All ads re-priced" />}
            <ScrollArea className="max-h-64 rounded-md border border-border">
              <div className="p-1">
                {results.map((r) => (
                  <RunRow
                    key={r.ad.advNo}
                    status={r.status}
                    advNo={r.ad.advNo}
                    tag={<span className="text-[11px] text-muted-foreground">{r.asset} {r.side}</span>}
                    change={`${fmtINR(r.current)} → ${fmtINR(r.next)}`}
                    message={r.message}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={!!invalidRung || pricesLoading} className="gap-1.5">Review <ArrowRight className="h-3.5 w-3.5" /></Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={executeUpdates}>Apply ladder to {ladder.length} ad{ladder.length !== 1 ? 's' : ''}</Button>
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
