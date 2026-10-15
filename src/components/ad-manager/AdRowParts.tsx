import { useAdsRights, NO_RIGHT } from './adsRights';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Copy, Edit, History, MoreVertical, ShieldBan, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BinanceAd, BINANCE_AD_STATUS, getAdHiddenReason } from '@/hooks/useBinanceAds';
import { AccountBadge } from '@/components/exchange/AccountBadge';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { QuickEditPopover } from './QuickEditPopover';
import { InlinePriceEditor } from './InlinePriceEditor';
import { useValueFlash } from '@/hooks/useValueFlash';
import { AdAutomationIndicator, AdAutomationInfo } from './AdAutomationIndicator';
import {
  ExcludedChip, HiddenChip, PriceTypeLabel, QtyBar, SideChip, StatusPill, ZoneChip,
  limitsText, qty, shortAdNo, stalePriceLabel, updatedText, updatedTitle,
} from './adUi';

/*
 * Cells shared by the Desk and Categorized views (table rows and the stacked
 * rows used on narrow screens). Presentation only — every action calls the
 * handler it is given, exactly as the tables did before.
 */

/** Below this width the Desk and Categorized tables become a stacked list (phones, narrow panes). */
export const AD_LIST_BREAKPOINT = 736;

/**
 * True while the element is narrower than `px`, so only one layout is mounted
 * at a time. Returns a callback ref; it re-attaches whenever the element changes.
 */
export function useWidthBelow(px: number): [(el: HTMLElement | null) => void, boolean] {
  const [below, setBelow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < px + 120 : false));
  const roRef = useRef<ResizeObserver | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setBelow(el.getBoundingClientRect().width < px);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
  }, [px]);
  useEffect(() => () => roRef.current?.disconnect(), []);
  return [setRef, below];
}

function formatCommissionRate(ad: BinanceAd, identifier?: string) {
  const list = ad.tradeMethodCommissionRateVoList || [];
  const matched = list.find((item) => String(item.tradeMethodIdentifier || item.tradeMethodName || '') === String(identifier || ''));
  const rate = matched?.commissionRate ?? ad.commissionRate ?? ad.takerCommissionRate;
  if (rate === undefined || rate === null || rate === '') return null;
  return `${(Number(rate) * 100).toFixed(4)}%`;
}

/** Price with the existing inline editor; flashes when the price changes. */
export function AdPriceValue({ ad, isEditing, onRequestEdit, onClose, stacked = true }: { ad: BinanceAd; isEditing: boolean; onRequestEdit: () => void; onClose: () => void; stacked?: boolean }) {
  const flash = useValueFlash(Number(ad.price || 0), 'value-flash');
  return (
    <div className={cn('inline-block rounded font-semibold tabular-nums text-foreground', flash)}>
      <InlinePriceEditor ad={ad} isEditing={isEditing} onRequestEdit={onRequestEdit} onClose={onClose} stacked={stacked} />
    </div>
  );
}

/** In tables, the automation and excluded chips shrink to their icon while the table is under 64rem wide. */
export const CHIP_LABEL_WIDE = 'sr-only @[64rem]:not-sr-only @[64rem]:whitespace-nowrap';

export function AdIdentity({ ad, automation, excluded, className, chipLabelClassName }: { ad: BinanceAd; automation?: AdAutomationInfo; excluded?: boolean; className?: string; chipLabelClassName?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-semibold leading-none text-foreground">{ad.asset}</span>
        <SideChip side={ad.tradeType} />
        <ZoneChip ad={ad} />
        <AdAutomationIndicator info={automation} labelClassName={chipLabelClassName} />
        {excluded && <ExcludedChip labelClassName={chipLabelClassName} />}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
        <span className="t-mono tabular-nums" title={`Ad ${ad.advNo}`}>{shortAdNo(ad.advNo)}</span>
        <span aria-hidden="true" className="text-muted-foreground/50">·</span>
        <PriceTypeLabel ad={ad} />
        <AccountBadge accountId={ad._exchangeAccountId} showName={false} />
      </div>
    </div>
  );
}

export function AdRemaining({ ad, align = 'right', bar = true }: { ad: BinanceAd; align?: 'left' | 'right'; bar?: boolean }) {
  const left = Number(ad.surplusAmount || 0);
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <div className={cn('whitespace-nowrap tabular-nums', left <= 0 ? 'text-destructive' : 'text-foreground')}>
        {qty(ad.surplusAmount)} <span className="text-[11px] text-muted-foreground">{ad.asset}</span>
      </div>
      <div className={cn('mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground', align === 'right' && 'justify-end')}>
        {bar && <QtyBar ad={ad} className="w-10" />}
        <span>of {qty(ad.initAmount)}</span>
      </div>
    </div>
  );
}

export function AdLimits({ ad }: { ad: BinanceAd }) {
  return <span className="whitespace-nowrap tabular-nums">{limitsText(ad)}</span>;
}

/**
 * Payment method chips. A fee shared by every method is shown once; otherwise each
 * chip carries its own fee ("each"), or one "fees vary" note in narrow cells ("summary").
 * Every method's fee is also in the tooltip.
 */
export function AdMethods({ ad, max = 3, fee = 'each', className }: { ad: BinanceAd; max?: number; fee?: 'each' | 'summary'; className?: string }) {
  const methods = ad.tradeMethods || [];
  const rates = methods.map((m) => formatCommissionRate(ad, m.identifier || m.payType));
  const uniform = rates.length > 0 && rates.every((r) => r === rates[0]);
  const feeTitle = methods.map((m, i) => `${m.tradeMethodName || m.identifier || m.payType}: ${rates[i] ?? 'no fee data'}`).join('\n');
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)} title={rates.some(Boolean) ? `Commission per payment method\n${feeTitle}` : undefined}>
      {methods.slice(0, max).map((m, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <PaymentMethodBadge identifier={m.identifier} payType={m.payType} size="sm" />
          {fee === 'each' && !uniform && rates[i] && <span className="text-[10px] tabular-nums text-muted-foreground">{rates[i]}</span>}
        </span>
      ))}
      {methods.length > max && (
        <span className="inline-flex h-5 items-center rounded-md border border-border px-1.5 text-[10px] text-muted-foreground" title={methods.slice(max).map((m) => m.tradeMethodName || m.identifier).join(', ')}>
          +{methods.length - max}
        </span>
      )}
      {uniform && rates[0] && <span className="text-[10px] tabular-nums text-muted-foreground">{rates[0]} fee</span>}
      {fee === 'summary' && !uniform && rates.some(Boolean) && <span className="text-[10px] text-muted-foreground">fees vary</span>}
    </div>
  );
}

export function AdStatusControl({ ad, onToggleStatus, isTogglingStatus, showHidden = true }: { ad: BinanceAd; onToggleStatus: (advNo: string, currentStatus: number) => void; isTogglingStatus: boolean; showHidden?: boolean }) {
  const isOnline = ad.advStatus === BINANCE_AD_STATUS.ONLINE;
  const isPrivate = ad.advStatus === BINANCE_AD_STATUS.PRIVATE;
  const hidden = getAdHiddenReason(ad);
  const { canToggle } = useAdsRights();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Switch
        checked={isOnline || isPrivate}
        onCheckedChange={() => onToggleStatus(ad.advNo, ad.advStatus)}
        disabled={isTogglingStatus || !canToggle}
        aria-label="Toggle ad status"
        title={!canToggle ? NO_RIGHT.toggle : isOnline ? 'Switch off (take offline)' : isPrivate ? 'Switch off (private ad goes offline)' : 'Switch on (go online)'}
        className="scale-90"
      />
      <StatusPill status={ad.advStatus} />
      {showHidden && hidden && <HiddenChip reason={hidden} />}
    </div>
  );
}

export function AdUpdated({ ad }: { ad: BinanceAd }) {
  const stale = stalePriceLabel(ad.updateTime);
  return (
    <div className="whitespace-nowrap text-[11px] leading-tight" title={updatedTitle(ad.updateTime)}>
      <span className="tabular-nums text-muted-foreground">{updatedText(ad.updateTime)}</span>
      {stale && <span className="block text-warning">{stale}</span>}
    </div>
  );
}

export function AdRowActions({
  ad, onEdit, onDuplicate, onHistory, canHistory, excluded, onToggleExclusion, exclusionPending,
}: {
  ad: BinanceAd;
  onEdit: (ad: BinanceAd) => void;
  onDuplicate?: (ad: BinanceAd) => void;
  onHistory?: (advNo: string) => void;
  canHistory: boolean;
  excluded: boolean;
  onToggleExclusion: () => void;
  exclusionPending: boolean;
}) {
  const { canManage, canExclude } = useAdsRights();
  return (
    <div className="flex items-center justify-end gap-0.5">
      {canManage ? (
        <QuickEditPopover ad={ad}>
          <Button variant="ghost" size="icon" aria-label="Quick edit price and limits" className="h-7 w-7" title="Quick edit — price & limits">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </QuickEditPopover>
      ) : (
        <Button variant="ghost" size="icon" aria-label="Quick edit price and limits" className="h-7 w-7" disabled title={NO_RIGHT.manage}>
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Edit" className="h-7 w-7" onClick={() => onEdit(ad)} disabled={!canManage} title={canManage ? 'Edit ad' : NO_RIGHT.manage}>
        <Edit className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More actions" title="More actions">
            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem]">
          {onDuplicate && (
            <DropdownMenuItem onClick={() => onDuplicate(ad)} disabled={!canManage} title={canManage ? undefined : NO_RIGHT.manage}><Copy className="mr-2 h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
          )}
          {onHistory && canHistory && (
            <DropdownMenuItem onClick={() => onHistory(ad.advNo)}><History className="mr-2 h-3.5 w-3.5" />History</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onToggleExclusion} disabled={exclusionPending || !canExclude} title={canExclude ? undefined : NO_RIGHT.exclude}>
            {excluded
              ? <><ShieldCheck className="mr-2 h-3.5 w-3.5" />Include in automation</>
              : <><ShieldBan className="mr-2 h-3.5 w-3.5" />Exclude from automation</>}
            {!canExclude && <span className="sr-only"> — {NO_RIGHT.exclude}</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
