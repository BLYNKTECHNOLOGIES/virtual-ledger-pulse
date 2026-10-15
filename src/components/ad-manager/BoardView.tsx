import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Lock, ChevronDown, ChevronRight, Megaphone, Clock3, EyeOff } from 'lucide-react';
import { AdAutomationIndicator, useAdAutomationMap } from './AdAutomationIndicator';
import { BinanceAd, BINANCE_AD_STATUS, getAdHiddenReason } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { InlinePriceEditor } from './InlinePriceEditor';
import { AdSortMode, applyAdSort, stalePriceLabel } from './CategorizedAdTable';
import { AccountBadge } from '@/components/exchange/AccountBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import { isBlockAd } from '@/lib/adZone';
import { useExcludedAds, useToggleAdExclusion } from '@/hooks/useAdAutomationExclusion';
import { AdRowActions } from './AdRowParts';
import { ExcludedChip, HiddenChip, QtyBar, SideChip, StatusDot, ZoneChip, hiddenReasonShort, limitsText, qty } from './adUi';


interface BoardViewProps {
  ads: BinanceAd[];
  onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  onHistory?: (advNo: string) => void;
  onDuplicate: (ad: BinanceAd) => void;
  isTogglingStatus: boolean;
  selectedAdvNos: Set<string>;
  onSelectionChange: (advNos: Set<string>) => void;
  sortMode?: AdSortMode;
  compact?: boolean;
}

function AdCard({
  ad, selected, onToggleSelect, onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, excluded, onToggleExclusion, exclusionPending, compact,
}: {
  ad: BinanceAd;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  onHistory?: (advNo: string) => void;
  onDuplicate: (ad: BinanceAd) => void;
  isTogglingStatus: boolean;
  excluded: boolean;
  onToggleExclusion: () => void;
  exclusionPending: boolean;
  compact?: boolean;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const automationMap = useAdAutomationMap();
  const isOnline = ad.advStatus === BINANCE_AD_STATUS.ONLINE;
  const isPrivate = ad.advStatus === BINANCE_AD_STATUS.PRIVATE;
  const isOffline = ad.advStatus === BINANCE_AD_STATUS.OFFLINE;

  const surplus = Number(ad.surplusAmount || 0);
  const outOfStock = surplus <= 0;
  const staleAge = stalePriceLabel(ad.updateTime);
  const hidden = getAdHiddenReason(ad);
  const methods = ad.tradeMethods || [];

  return (
    <article
      aria-label={`${ad.tradeType} ${ad.asset} ad …${(ad.advNo || '').slice(-8)}`}
      className={cn(
        'relative flex min-w-0 flex-col rounded-lg border bg-card shadow-xs transition-[border-color,box-shadow] duration-150',
        compact ? 'gap-2 p-2.5' : 'gap-3 p-3',
        selected
          ? 'border-primary ring-1 ring-primary'
          : outOfStock
            ? 'border-destructive/50'
            : isPrivate
              ? 'border-warning/50'
              : 'border-border hover:border-muted-foreground/40',
      )}
    >
      <div className={cn('flex min-w-0 flex-col', compact ? 'gap-1.5' : 'gap-2.5', isOffline && 'opacity-60 grayscale-[.3]')}>
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ad ${ad.advNo}`} />
          <span className="text-sm font-semibold leading-none text-foreground">{ad.asset}</span>
          <SideChip side={ad.tradeType} />
          <ZoneChip ad={ad} />
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{ad.priceType === 1 ? 'Fixed' : 'Floating'}</span>
          {isPrivate && <Lock className="h-3 w-3 shrink-0 text-warning" aria-label="Private ad" />}
          {compact && hidden && <HiddenChip reason={hidden} />}
          <AccountBadge accountId={ad._exchangeAccountId} showName={false} />
          <span className="t-mono ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground" title={`Ad ${ad.advNo}`}>
            …{(ad.advNo || '').slice(-6)}
          </span>
        </div>

        {/* Price */}
        <div>
          <div className={cn('font-semibold leading-none tabular-nums text-foreground', compact ? 'text-lg' : 'text-2xl')}>
            <InlinePriceEditor
              ad={ad}
              isEditing={editingPrice}
              onRequestEdit={() => setEditingPrice(true)}
              onClose={() => setEditingPrice(false)}
            />
          </div>
          {staleAge && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-warning" title="This ad has not been updated for over 30 minutes">
              <Clock3 className="h-3 w-3" /> Updated {staleAge}
            </div>
          )}
        </div>

        {/* Remaining quantity */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
            <span className={cn('min-w-0 truncate', outOfStock ? 'font-medium text-destructive' : 'text-foreground')}>
              {surplus.toLocaleString('en-IN')} {ad.asset} <span className={outOfStock ? undefined : 'text-muted-foreground'}>{outOfStock ? 'left — empty' : 'left'}</span>
            </span>
            <span className="shrink-0 text-muted-foreground">of {qty(ad.initAmount)}</span>
          </div>
          <QtyBar ad={ad} />
        </div>

        {/* Limits and methods */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground" title="Order limit">
            {limitsText(ad)}
          </span>
          <div className="flex shrink-0 items-center gap-1 overflow-hidden">
            {methods.slice(0, 2).map((m, i) => (
              <PaymentMethodBadge key={i} identifier={m.identifier} payType={m.payType} size="sm" />
            ))}
            {methods.length > 2 && (
              <span className="inline-flex h-5 shrink-0 items-center rounded-md border border-border px-1.5 text-[10px] text-muted-foreground" title={methods.slice(2).map((x) => x.tradeMethodName || x.identifier).join(', ')}>
                +{methods.length - 2}
              </span>
            )}
          </div>
        </div>

        {!compact && hidden && (
          <div className="flex items-start gap-1.5 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive" title={hidden}>
            <EyeOff className="mt-px h-3 w-3 shrink-0" />
            <span><span className="font-semibold">Not visible on Binance.</span> {hiddenReasonShort(hidden)}.</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <Switch
            checked={isOnline || isPrivate}
            onCheckedChange={() => onToggleStatus(ad.advNo, ad.advStatus)}
            disabled={isTogglingStatus}
            aria-label="Toggle ad status"
            title={isOnline ? 'Switch off (take offline)' : isPrivate ? 'Switch off (private ad goes offline)' : 'Switch on (go online)'}
          />
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <StatusDot status={ad.advStatus} />
            {isOnline ? 'Active' : isPrivate ? 'Private' : 'Inactive'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <AdAutomationIndicator info={automationMap.get(ad.advNo)} />
          {excluded && <ExcludedChip />}
          <AdRowActions
            ad={ad}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onHistory={onHistory}
            canHistory
            excluded={excluded}
            onToggleExclusion={onToggleExclusion}
            exclusionPending={exclusionPending}
          />
        </div>
      </div>
    </article>
  );
}

interface ZoneProps {
  label: string;
  side: 'BUY' | 'SELL';
  ads: BinanceAd[];
  sortMode: AdSortMode;
  onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  onHistory?: (advNo: string) => void;
  onDuplicate: (ad: BinanceAd) => void;
  isTogglingStatus: boolean;
  compact?: boolean;
  selectedAdvNos: Set<string>;
  onSelectionChange: (advNos: Set<string>) => void;
  excludedAds?: Set<string>;
  onToggleExclusion: (ad: BinanceAd) => void;
  exclusionPending: boolean;
}

const CARD_GRID = 'grid grid-cols-1 gap-3 @[34rem]:grid-cols-2 @[56rem]:grid-cols-3 @[84rem]:grid-cols-4';

function DeskCounts({ ads }: { ads: BinanceAd[] }) {
  const on = ads.filter((a) => a.advStatus !== BINANCE_AD_STATUS.OFFLINE).length;
  const hidden = ads.filter((a) => getAdHiddenReason(a)).length;
  return (
    <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
      <span><span className="font-medium text-foreground">{on}</span> on</span>
      <span>{ads.length - on} off</span>
      {hidden > 0 && <span className="text-destructive">{hidden} not visible</span>}
    </span>
  );
}

function Zone({
  label, side, ads, sortMode,
  selectedAdvNos, onSelectionChange, excludedAds, onToggleExclusion, exclusionPending,
  onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, compact,
}: ZoneProps) {
  const sorted = useMemo(() => applyAdSort(ads, sortMode), [ads, sortMode]);

  const toggleOne = (advNo: string) => {
    const next = new Set(selectedAdvNos);
    next.has(advNo) ? next.delete(advNo) : next.add(advNo);
    onSelectionChange(next);
  };

  return (
    <section className="@container min-w-0 space-y-3" aria-label={label}>
      <div className={cn('flex items-center justify-between gap-2 rounded-lg border border-border border-l-[3px] bg-card px-3 py-2', side === 'BUY' ? 'border-l-trade-buy' : 'border-l-trade-sell')}>
        <span className="flex items-center gap-2">
          <span className={cn('text-sm font-semibold', side === 'BUY' ? 'text-trade-buy' : 'text-trade-sell')}>{label}</span>
          <span className="t-mono rounded bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">{ads.length}</span>
        </span>
        <DeskCounts ads={ads} />
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={Megaphone} title="No ads" description={`No ${side === 'BUY' ? 'buy' : 'sell'} ads match this view.`} className="rounded-lg border border-dashed border-border py-8" />
      ) : (
        <div className={CARD_GRID}>
          {sorted.map((ad) => (
            <AdCard
              key={ad.advNo}
              ad={ad}
              selected={selectedAdvNos.has(ad.advNo)}
              onToggleSelect={() => toggleOne(ad.advNo)}
              excluded={!!excludedAds?.has(ad.advNo)}
              onToggleExclusion={() => onToggleExclusion(ad)}
              exclusionPending={exclusionPending}
              onEdit={onEdit}
              onToggleStatus={onToggleStatus}
              onHistory={onHistory}
              onDuplicate={onDuplicate}
              isTogglingStatus={isTogglingStatus}
              compact={compact}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function BoardView({ ads, onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, selectedAdvNos, onSelectionChange, sortMode = 'current', compact = false }: BoardViewProps) {
  const { data: excludedAds } = useExcludedAds();
  const toggleExclusion = useToggleAdExclusion();
  const [blockOpen, setBlockOpen] = useState(false);

  const { buyAds, sellAds, blockAds } = useMemo(() => {
    const buyAds: BinanceAd[] = [];
    const sellAds: BinanceAd[] = [];
    const blockAds: BinanceAd[] = [];
    for (const ad of ads) {
      if (isBlockAd(ad)) blockAds.push(ad);
      else if (ad.tradeType === 'BUY') buyAds.push(ad);
      else sellAds.push(ad);
    }
    return { buyAds, sellAds, blockAds };
  }, [ads]);

  const zoneCommon = {
    onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, sortMode, compact,
    selectedAdvNos, onSelectionChange,
    excludedAds, onToggleExclusion: (ad: BinanceAd) => toggleExclusion.mutate({ advNo: ad.advNo, exclude: !excludedAds?.has(ad.advNo) }),
    exclusionPending: toggleExclusion.isPending,
  };

  if (!ads || ads.length === 0) {
    return <EmptyState icon={Megaphone} title="No ads found" description="Nothing matches this tab, status and filters." className="rounded-lg border border-dashed border-border py-12" />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Zone label="Buy desk" side="BUY" ads={buyAds} {...(zoneCommon as any)} />
        <Zone label="Sell desk" side="SELL" ads={sellAds} {...(zoneCommon as any)} />
      </div>

      {blockAds.length > 0 && (
        <section className="@container space-y-3" aria-label="Block ads">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setBlockOpen((o) => !o)}
            aria-expanded={blockOpen}
          >
            {blockOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm font-semibold text-foreground">Block ads</span>
            <span className="t-mono rounded bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">{blockAds.length}</span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Block zone — a separate order book</span>
            <span className="ml-auto"><DeskCounts ads={blockAds} /></span>
          </button>
          {blockOpen && (
            <div className={CARD_GRID}>
              {applyAdSort(blockAds, sortMode).map((ad) => (
                <AdCard
                  key={ad.advNo}
                  ad={ad}
                  selected={selectedAdvNos.has(ad.advNo)}
                  onToggleSelect={() => {
                    const next = new Set(selectedAdvNos);
                    next.has(ad.advNo) ? next.delete(ad.advNo) : next.add(ad.advNo);
                    onSelectionChange(next);
                  }}
                  excluded={!!excludedAds?.has(ad.advNo)}
                  onToggleExclusion={() => toggleExclusion.mutate({ advNo: ad.advNo, exclude: !excludedAds?.has(ad.advNo) })}
                  exclusionPending={toggleExclusion.isPending}
                  onEdit={onEdit}
                  onToggleStatus={onToggleStatus}
                  onHistory={onHistory}
                  onDuplicate={onDuplicate}
                  isTogglingStatus={isTogglingStatus}
                  compact={compact}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
