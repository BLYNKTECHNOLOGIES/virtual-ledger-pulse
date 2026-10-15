import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdsRights, NO_RIGHT } from './adsRights';
import { Edit, Percent, Power, PowerOff, X, Blend, ShieldAlert, ListChecks, CreditCard, ArrowDownWideNarrow, Maximize2, ChevronUp } from 'lucide-react';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { adZone, zonesOf } from '@/lib/adZone';
import { cn } from '@/lib/utils';


interface BulkActionToolbarProps {
  selectedAds: BinanceAd[];
  onClearSelection: () => void;
  onBulkEditLimits: () => void;
  onBulkEditPaymentMethods: () => void;
  onBulkFloatingPrice: () => void;
  onBulkPriceLadder: () => void;
  onBulkHybridAdjust: () => void;
  onBulkRiskGuard: () => void;
  onBulkMaxQuantity: () => void;
  onBulkActivate: () => void;
  onBulkDeactivate: () => void;
  totalAds?: number;
  onSelectAll?: () => void;
  /** ERP shell on phones has a fixed bottom navigation bar; float above it. */
  aboveBottomNav?: boolean;
}

/** A disabled button does not receive hover, so its reason sits on a wrapper. */
function WithReason({ reason, children }: { reason?: string; children: ReactNode }) {
  return <span title={reason} className="inline-flex">{children}</span>;
}

const ACT = 'h-8 gap-1.5 px-2.5 text-xs text-foreground disabled:text-muted-foreground';

/**
 * Bulk actions for the selected ads. Floats at the bottom of the screen (rendered
 * into <body> so it stays put while the list scrolls) and never shifts the list.
 * z-50 with a later DOM position keeps it above the ERP bottom nav and help button,
 * while dialogs, menus and toasts opened afterwards still stack on top of it.
 */
export function BulkActionToolbar({
  selectedAds,
  onClearSelection,
  onBulkEditLimits,
  onBulkEditPaymentMethods,
  onBulkFloatingPrice,
  onBulkPriceLadder,
  onBulkHybridAdjust,
  onBulkRiskGuard,
  onBulkMaxQuantity,
  onBulkActivate,
  onBulkDeactivate,
  totalAds,
  onSelectAll,
  aboveBottomNav = false,
}: BulkActionToolbarProps) {
  // AM-SEC-2: edits need Manage; Activate/Deactivate need Toggle or Manage.
  const { canManage, canToggle } = useAdsRights();
  const allFloating = selectedAds.every(ad => ad.priceType === 2);
  const hasFixed = selectedAds.some(ad => ad.priceType === 1);
  const hasFloating = selectedAds.some(ad => ad.priceType === 2);
  const hasMix = hasFixed && hasFloating;
  const hasOnline = selectedAds.some(ad => ad.advStatus === BINANCE_AD_STATUS.ONLINE);
  const hasOffline = selectedAds.some(ad => ad.advStatus !== BINANCE_AD_STATUS.ONLINE);
  const buyCount = selectedAds.filter(ad => ad.tradeType === 'BUY').length;
  const sellCount = selectedAds.filter(ad => ad.tradeType === 'SELL').length;
  const someButNotAll = typeof totalAds === 'number' && selectedAds.length > 0 && selectedAds.length < totalAds;

  const zones = zonesOf(selectedAds);
  const blockCount = selectedAds.filter(ad => adZone(ad) === 'block').length;
  const singleZone = zones.length <= 1;

  const singleSide = buyCount === 0 || sellCount === 0;
  const ladderReady = selectedAds.length >= 2 && singleSide && singleZone;
  const ladderReason = selectedAds.length < 2
    ? 'Select at least 2 ads'
    : !singleSide
      ? 'Select ads of a single side — buy and sell ads cannot be laddered together'
      : !singleZone
        ? 'Select ads of a single market zone — P2P-zone and Block-zone ads trade at different price levels and cannot be laddered together'
        : 'Step selected ads down in 0.51 increments from a top fixed rate (per asset group)';
  const floatingReason = !allFloating ? 'All selected ads must be floating price type' : 'Adjust floating price ratio';

  const count = (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold tabular-nums text-primary-foreground">
      {selectedAds.length} ad{selectedAds.length !== 1 ? 's' : ''} selected
    </span>
  );
  const breakdown = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
      <span>{buyCount} buy / {sellCount} sell</span>
      <span>{selectedAds.length - blockCount} P2P / {blockCount} Block</span>
      {!singleZone && (
        <span className="inline-flex h-5 items-center rounded border border-warning/40 bg-warning/10 px-1.5 text-[10px] font-medium text-warning">
          Mixed zones
        </span>
      )}
    </span>
  );

  const bar = (
    <div className={cn('pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3', aboveBottomNav ? 'bottom-[4.75rem] md:bottom-4' : 'bottom-3 sm:bottom-4')}>
      <div
        role="region"
        aria-label="Bulk actions for the selected ads"
        data-ad-bulk-actions=""
        className="pointer-events-auto flex w-full max-w-[min(100%,78rem)] flex-col gap-2 rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-popover-foreground shadow-lg backdrop-blur-sm animate-fade-in-up sm:w-auto"
      >
        {/* Phones: count, one actions menu, clear */}
        <div className="flex items-center gap-2 md:hidden">
          {count}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                Actions <ChevronUp className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
              {canManage ? (<>
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Price</DropdownMenuLabel>
              <DropdownMenuItem onClick={onBulkPriceLadder} disabled={!ladderReady}>
                <ArrowDownWideNarrow className="mr-2 h-3.5 w-3.5" />
                <span className="flex flex-col">Price ladder{!ladderReady && <span className="text-[10px] text-muted-foreground">{ladderReason}</span>}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onBulkFloatingPrice} disabled={!allFloating}>
                <Percent className="mr-2 h-3.5 w-3.5" />
                <span className="flex flex-col">Floating %{!allFloating && <span className="text-[10px] text-muted-foreground">{floatingReason}</span>}</span>
              </DropdownMenuItem>
              {hasMix && (
                <DropdownMenuItem onClick={onBulkHybridAdjust}><Blend className="mr-2 h-3.5 w-3.5" />Hybrid adjust</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Limits and terms</DropdownMenuLabel>
              <DropdownMenuItem onClick={onBulkEditLimits}><Edit className="mr-2 h-3.5 w-3.5" />Order limits</DropdownMenuItem>
              <DropdownMenuItem onClick={onBulkMaxQuantity}><Maximize2 className="mr-2 h-3.5 w-3.5" />Max quantity</DropdownMenuItem>
              <DropdownMenuItem onClick={onBulkEditPaymentMethods}><CreditCard className="mr-2 h-3.5 w-3.5" />Payment methods</DropdownMenuItem>
              <DropdownMenuItem onClick={onBulkRiskGuard} className="text-warning focus:text-warning"><ShieldAlert className="mr-2 h-3.5 w-3.5" />Risk guard</DropdownMenuItem>
              </>) : (
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Price and limit edits: {NO_RIGHT.manage}</DropdownMenuLabel>
              )}
              {(hasOffline || hasOnline) && <DropdownMenuSeparator />}
              {hasOffline && canToggle && (
                <DropdownMenuItem onClick={onBulkActivate} className="text-success focus:text-success"><Power className="mr-2 h-3.5 w-3.5" />Activate</DropdownMenuItem>
              )}
              {hasOnline && canToggle && (
                <DropdownMenuItem onClick={onBulkDeactivate} className="text-destructive focus:text-destructive"><PowerOff className="mr-2 h-3.5 w-3.5" />Deactivate</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="ml-auto h-8 gap-1 px-2 text-xs" aria-label="Clear selection">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          {breakdown}
          {someButNotAll && onSelectAll && (
            <Button variant="link" size="sm" onClick={onSelectAll} className="h-auto p-0 text-[11px] text-primary">
              Select all {totalAds}
            </Button>
          )}
        </div>

        {/* Tablet and desktop: everything in one bar */}
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 md:flex">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              {count}
              {someButNotAll && onSelectAll && (
                <Button variant="ghost" size="sm" onClick={onSelectAll} className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary">
                  <ListChecks className="h-3.5 w-3.5" />
                  Select all {totalAds}
                </Button>
              )}
            </div>
            {breakdown}
          </div>

          <div className="h-5 w-px bg-border" aria-hidden="true" />

          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Price">
            <WithReason reason={ladderReason}>
              <Button variant="outline" size="sm" onClick={onBulkPriceLadder} disabled={!ladderReady} className={ACT}>
                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                Price ladder
              </Button>
            </WithReason>
            <WithReason reason={floatingReason}>
              <Button variant="outline" size="sm" onClick={onBulkFloatingPrice} disabled={!allFloating} className={ACT}>
                <Percent className="h-3.5 w-3.5" />
                Floating %
              </Button>
            </WithReason>
            {hasMix && (
              <Button variant="outline" size="sm" onClick={onBulkHybridAdjust} className={ACT} title="Set one target USDT price: fixed ads use it, floating ads get the matching ratio">
                <Blend className="h-3.5 w-3.5" />
                Hybrid adjust
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Limits and terms">
            <Button variant="outline" size="sm" onClick={onBulkEditLimits} className={ACT}>
              <Edit className="h-3.5 w-3.5" />
              Order limits
            </Button>
            <Button variant="outline" size="sm" onClick={onBulkMaxQuantity} className={ACT}>
              <Maximize2 className="h-3.5 w-3.5" />
              Max quantity
            </Button>
            <Button variant="outline" size="sm" onClick={onBulkEditPaymentMethods} className={ACT}>
              <CreditCard className="h-3.5 w-3.5" />
              Payment methods
            </Button>
            <Button variant="outline" size="sm" onClick={onBulkRiskGuard} className={cn(ACT, 'border-warning/35 text-warning hover:text-warning')}>
              <ShieldAlert className="h-3.5 w-3.5" />
              Risk guard
            </Button>
          </div>

          {(hasOffline || hasOnline) && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Status">
              {hasOffline && (
                <Button variant="outline" size="sm" onClick={onBulkActivate} className={cn(ACT, 'border-success/35 text-success hover:text-success')}>
                  <Power className="h-3.5 w-3.5" />
                  Activate
                </Button>
              )}
              {hasOnline && (
                <Button variant="outline" size="sm" onClick={onBulkDeactivate} className={cn(ACT, 'border-destructive/35 text-destructive hover:text-destructive')}>
                  <PowerOff className="h-3.5 w-3.5" />
                  Deactivate
                </Button>
              )}
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={onClearSelection} className="ml-auto h-8 gap-1 px-2 text-xs">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(bar, document.body) : bar;
}
