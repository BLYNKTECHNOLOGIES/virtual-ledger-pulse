import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MoreVertical, Edit, Copy, History, Lock, ShieldBan, ShieldCheck, ChevronDown, ChevronRight, Zap,
} from 'lucide-react';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { InlinePriceEditor } from './InlinePriceEditor';
import { QuickEditPopover } from './QuickEditPopover';
import { AdSortMode, applyAdSort, stalePriceLabel } from './CategorizedAdTable';
import { AccountBadge } from '@/components/exchange/AccountBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExcludedAds, useToggleAdExclusion } from '@/hooks/useAdAutomationExclusion';

function isBlockAd(ad: BinanceAd) {
  return String(ad.classify || '').toLowerCase() === 'block';
}

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
  const isBuy = ad.tradeType === 'BUY';
  const isOnline = ad.advStatus === BINANCE_AD_STATUS.ONLINE;
  const isPrivate = ad.advStatus === BINANCE_AD_STATUS.PRIVATE;
  const isOffline = ad.advStatus === BINANCE_AD_STATUS.OFFLINE;

  const surplus = Number(ad.surplusAmount || 0);
  const outOfStock = surplus <= 0;
  const staleAge = stalePriceLabel(ad.updateTime);

  const tint = isBuy ? 'bg-trade-buy/10 text-trade-buy border-trade-buy/30' : 'bg-trade-sell/10 text-trade-sell border-trade-sell/30';

  return (
    <Card
      className={cn(
        'relative flex flex-col gap-2 p-3',
        selected && 'ring-2 ring-primary',
        isPrivate && 'border-warning/50',
        outOfStock && 'border-destructive/50',
        lowStock && !outOfStock && 'border-warning/50',
        isOffline && 'opacity-60 grayscale-[.4]',
      )}
    >
      {/* Stale price dot */}
      {staleAge && (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-warning" title={`Price updated ${staleAge}`} />
      )}

      {/* Header */}
      <div className="flex items-center gap-2">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ad ${ad.advNo}`} />
        <Badge variant="outline" className={cn('text-[10px] font-semibold', tint)}>{ad.tradeType}</Badge>
        <span className="font-semibold text-sm text-foreground">{ad.asset}</span>
        {isPrivate && <Lock className="h-3 w-3 text-warning" />}
        <AccountBadge accountId={ad._exchangeAccountId} showName={false} />
        <div className="ml-auto flex items-center gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleExclusion} disabled={exclusionPending} aria-label="Automation exclusion">
                  {excluded ? <ShieldBan className="h-3.5 w-3.5 text-destructive" /> : <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{excluded ? 'Excluded from automation — click to include' : 'Click to exclude from automation'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Price hero */}
      <div className="text-2xl font-semibold tabular-nums text-foreground">
        <InlinePriceEditor
          ad={ad}
          isEditing={editingPrice}
          onRequestEdit={() => setEditingPrice(true)}
          onClose={() => setEditingPrice(false)}
        />
      </div>

      {/* Stock bar */}
      <div className="space-y-1">
        <Progress
          value={pct}
          className={cn('h-1.5', outOfStock ? '[&>div]:bg-destructive' : lowStock ? '[&>div]:bg-warning' : '')}
        />
        <div className={cn('text-[11px] tabular-nums', outOfStock ? 'text-destructive' : lowStock ? 'text-warning' : 'text-muted-foreground')}>
          {surplus.toLocaleString('en-IN')} / {init.toLocaleString('en-IN')} {ad.asset}
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          ₹{Number(ad.minSingleTransAmount || 0).toLocaleString('en-IN')}~₹{Number(ad.maxSingleTransAmount || 0).toLocaleString('en-IN')}
        </span>
        <div className="flex items-center gap-1">
          {(ad.tradeMethods || []).slice(0, 2).map((m, i) => (
            <PaymentMethodBadge key={i} identifier={m.identifier} payType={m.payType} size="sm" />
          ))}
          {(ad.tradeMethods || []).length > 2 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{ad.tradeMethods.length - 2}</Badge>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={isOnline || isPrivate}
            onCheckedChange={() => onToggleStatus(ad.advNo, ad.advStatus)}
            disabled={isTogglingStatus}
            aria-label="Toggle ad status"
          />
          <span className="text-[11px] text-muted-foreground">
            {isOnline ? 'Active' : isPrivate ? 'Private' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <QuickEditPopover ad={ad}>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Quick edit" title="Quick Edit">
              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </QuickEditPopover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More actions">
                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(ad)}><Edit className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(ad)}><Copy className="h-3.5 w-3.5 mr-2" />Duplicate</DropdownMenuItem>
              {onHistory && (
                <DropdownMenuItem onClick={() => onHistory(ad.advNo)}><History className="h-3.5 w-3.5 mr-2" />History</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

interface ZoneProps {
  label: string;
  tintClass: string;
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

function Zone({
  label, tintClass, ads, sortMode,
  selectedAdvNos, onSelectionChange, excludedAds, onToggleExclusion, exclusionPending,
  onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, compact,
}: ZoneProps) {
  const sorted = useMemo(() => applyAdSort(ads, sortMode), [ads, sortMode]);
  const totalSurplus = useMemo(() => ads.reduce((s, a) => s + Number(a.surplusAmount || 0), 0), [ads]);

  const toggleOne = (advNo: string) => {
    const next = new Set(selectedAdvNos);
    next.has(advNo) ? next.delete(advNo) : next.add(advNo);
    onSelectionChange(next);
  };

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center justify-between rounded-md border px-3 py-1.5', tintClass)}>
        <span className="text-sm font-semibold">{label} <span className="opacity-70">({ads.length})</span></span>
        <span className="text-xs tabular-nums opacity-80">{totalSurplus.toLocaleString('en-IN')} surplus</span>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={Megaphone} title="No ads" className="py-8" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
    </div>
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
    return <EmptyState icon={Megaphone} title="No ads found" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Zone label="Buy Desk" tintClass="bg-trade-buy/10 text-trade-buy border-trade-buy/30" ads={buyAds} {...(zoneCommon as any)} />
        <Zone label="Sell Desk" tintClass="bg-trade-sell/10 text-trade-sell border-trade-sell/30" ads={sellAds} {...(zoneCommon as any)} />
      </div>

      {blockAds.length > 0 && (
        <div className="space-y-3">
          <button
            className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 w-full text-left"
            onClick={() => setBlockOpen((o) => !o)}
          >
            {blockOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-sm font-semibold text-foreground">Block Ads</span>
            <span className="text-xs text-muted-foreground">({blockAds.length})</span>
          </button>
          {blockOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
        </div>
      )}
    </div>
  );
}
