import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Power, PowerOff, Lock, ChevronDown, ChevronRight, ShieldBan, ShieldCheck, Megaphone, History, Copy, Zap } from 'lucide-react';
import { BinanceAd, getAdStatusLabel, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { InlinePriceEditor } from './InlinePriceEditor';
import { QuickEditPopover } from './QuickEditPopover';
import { AccountBadge } from '@/components/exchange/AccountBadge';
import { format } from 'date-fns';
import { useState } from 'react';
import { useExcludedAds, useToggleAdExclusion } from '@/hooks/useAdAutomationExclusion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useValueFlash } from '@/hooks/useValueFlash';

export type AdSortMode = 'current' | 'price-asc' | 'price-desc' | 'avail-asc' | 'avail-desc' | 'updated-desc';

export function applyAdSort(list: BinanceAd[], mode: AdSortMode): BinanceAd[] {
  if (mode === 'current') return list;
  const arr = [...list];
  switch (mode) {
    case 'price-asc': return arr.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    case 'price-desc': return arr.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    case 'avail-asc': return arr.sort((a, b) => Number(a.surplusAmount || 0) - Number(b.surplusAmount || 0));
    case 'avail-desc': return arr.sort((a, b) => Number(b.surplusAmount || 0) - Number(a.surplusAmount || 0));
    case 'updated-desc': return arr.sort((a, b) => new Date(b.updateTime || 0).getTime() - new Date(a.updateTime || 0).getTime());
    default: return arr;
  }
}

function AdPriceCell({ ad, isEditing, onRequestEdit, onClose }: { ad: BinanceAd; isEditing: boolean; onRequestEdit: () => void; onClose: () => void }) {
  const flash = useValueFlash(Number(ad.price || 0), 'value-flash');
  return (
    <TableCell className={`text-right font-semibold tabular-nums ${flash}`}>
      <InlinePriceEditor ad={ad} isEditing={isEditing} onRequestEdit={onRequestEdit} onClose={onClose} />
    </TableCell>
  );
}

/** Amber "Xh ago" label when an ad's price is older than 30 min, else null. */
export function stalePriceLabel(updateTime?: string): string | null {
  if (!updateTime) return null;
  const mins = Math.floor((Date.now() - new Date(updateTime).getTime()) / 60000);
  if (mins <= 30) return null;
  return mins >= 60 ? `${Math.floor(mins / 60)}h ago` : `${mins}m ago`;
}




function formatCommissionRate(ad: BinanceAd, identifier?: string) {
  const list = ad.tradeMethodCommissionRateVoList || [];
  const matched = list.find((item) => String(item.tradeMethodIdentifier || item.tradeMethodName || '') === String(identifier || ''));
  const rate = matched?.commissionRate ?? ad.commissionRate ?? ad.takerCommissionRate;
  if (rate === undefined || rate === null || rate === '') return null;
  return `${(Number(rate) * 100).toFixed(4)}%`;
}

function isBlockAd(ad: BinanceAd) {
  return String(ad.classify || '').toLowerCase() === 'block';
}

const COLLAPSE_PREF_KEY_PREFIX = 'terminal_ad_group_collapse_';

interface CategorizedAdTableProps {
  ads: BinanceAd[];
   onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  onHistory?: (advNo: string) => void;
  onDuplicate?: (ad: BinanceAd) => void;
  isTogglingStatus: boolean;
  selectedAdvNos: Set<string>;
  onSelectionChange: (advNos: Set<string>) => void;
  sortMode?: AdSortMode;
  compact?: boolean;
}

interface AdGroup {
  label: string;
  subLabel: string;
  ads: BinanceAd[];
  key: string;
}

interface AdCategory {
  label: string;
  key: string;
  colorClass: string;
  groups: AdGroup[];
}

function useSmallConfigs() {
  const buyConfig = useQuery({
    queryKey: ['small-buys-config'],
    queryFn: async () => {
      const { data } = await supabase.from('small_buys_config').select('min_amount, max_amount').limit(1).single();
      return data;
    },
    staleTime: 60_000,
  });

  const sellConfig = useQuery({
    queryKey: ['small-sales-config'],
    queryFn: async () => {
      const { data } = await supabase.from('small_sales_config').select('min_amount, max_amount').limit(1).single();
      return data;
    },
    staleTime: 60_000,
  });

  return { buyConfig: buyConfig.data, sellConfig: sellConfig.data };
}

function categorizeAds(
  ads: BinanceAd[],
  buyConfig: { min_amount: number; max_amount: number } | null | undefined,
  sellConfig: { min_amount: number; max_amount: number } | null | undefined
): AdCategory[] {
  const smallBuyMin = buyConfig?.min_amount ?? 200;
  const smallBuyMax = buyConfig?.max_amount ?? 4000;
  const smallSellMin = sellConfig?.min_amount ?? 200;
  const smallSellMax = sellConfig?.max_amount ?? 4000;

  const buckets = {
    blockFixed: [] as BinanceAd[],
    blockFloating: [] as BinanceAd[],
    smallBuyFixed: [] as BinanceAd[],
    smallBuyFloating: [] as BinanceAd[],
    bigBuyFixed: [] as BinanceAd[],
    bigBuyFloating: [] as BinanceAd[],
    smallSellFixed: [] as BinanceAd[],
    smallSellFloating: [] as BinanceAd[],
    bigSellFixed: [] as BinanceAd[],
    bigSellFloating: [] as BinanceAd[],
  };

  for (const ad of ads) {
    const isBlock = isBlockAd(ad);
    const isBuy = ad.tradeType === 'BUY';
    const isFixed = ad.priceType === 1;
    const maxTrans = Number(ad.maxSingleTransAmount || 0);
    const minTrans = Number(ad.minSingleTransAmount || 0);

    if (isBlock) {
      (isFixed ? buckets.blockFixed : buckets.blockFloating).push(ad);
      continue;
    }

    if (isBuy) {
      // An ad is "small" if its minimum order limit falls within the small config range
      const isSmall = minTrans >= smallBuyMin && minTrans <= smallBuyMax;
      if (isSmall) {
        (isFixed ? buckets.smallBuyFixed : buckets.smallBuyFloating).push(ad);
      } else {
        (isFixed ? buckets.bigBuyFixed : buckets.bigBuyFloating).push(ad);
      }
    } else {
      const isSmall = minTrans >= smallSellMin && minTrans <= smallSellMax;
      if (isSmall) {
        (isFixed ? buckets.smallSellFixed : buckets.smallSellFloating).push(ad);
      } else {
        (isFixed ? buckets.bigSellFixed : buckets.bigSellFloating).push(ad);
      }
    }
  }

  // Keep same-coin ads together, and within each coin show the lower-priced ad on top.
  const sortGroup = (list: BinanceAd[]) =>
    [...list].sort((a, b) => {
      const assetCmp = String(a.asset || '').localeCompare(String(b.asset || ''));
      if (assetCmp !== 0) return assetCmp;
      return Number(a.price || 0) - Number(b.price || 0);
    });

  for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
    buckets[key] = sortGroup(buckets[key]);
  }

  return [
    {
      label: 'Block Ads',
      key: 'block',
      colorClass: 'bg-secondary text-secondary-foreground border-border',
      groups: [
        { label: 'Block', subLabel: 'Block Fixed', ads: buckets.blockFixed, key: 'block-fixed' },
        { label: 'Block', subLabel: 'Block Floating', ads: buckets.blockFloating, key: 'block-floating' },
      ],
    },
    {
      label: 'Small Buy Ads',
      key: 'small-buy',
      colorClass: 'bg-trade-buy/10 text-trade-buy border-trade-buy/30',
      groups: [
        { label: 'Small Buy', subLabel: 'Fixed', ads: buckets.smallBuyFixed, key: 'small-buy-fixed' },
        { label: 'Small Buy', subLabel: 'Floating', ads: buckets.smallBuyFloating, key: 'small-buy-floating' },
      ],
    },
    {
      label: 'Small Sale Ads',
      key: 'small-sell',
      colorClass: 'bg-trade-sell/10 text-trade-sell border-trade-sell/30',
      groups: [
        { label: 'Small Sale', subLabel: 'Fixed', ads: buckets.smallSellFixed, key: 'small-sell-fixed' },
        { label: 'Small Sale', subLabel: 'Floating', ads: buckets.smallSellFloating, key: 'small-sell-floating' },
      ],
    },
    {
      label: 'Big Buy Ads',
      key: 'big-buy',
      colorClass: 'bg-primary/10 text-primary border-primary/30',
      groups: [
        { label: 'Big Buy', subLabel: 'Fixed', ads: buckets.bigBuyFixed, key: 'big-buy-fixed' },
        { label: 'Big Buy', subLabel: 'Floating', ads: buckets.bigBuyFloating, key: 'big-buy-floating' },
      ],
    },
    {
      label: 'Big Sale Ads',
      key: 'big-sell',
      colorClass: 'bg-destructive/10 text-destructive border-destructive/30',
      groups: [
        { label: 'Big Sale', subLabel: 'Fixed', ads: buckets.bigSellFixed, key: 'big-sell-fixed' },
        { label: 'Big Sale', subLabel: 'Floating', ads: buckets.bigSellFloating, key: 'big-sell-floating' },
      ],
    },
  ];
}

export function CategorizedAdTable({ ads, onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, selectedAdvNos, onSelectionChange, sortMode = 'current', compact = false }: CategorizedAdTableProps) {
  const { user } = useAuth();
  const { buyConfig, sellConfig } = useSmallConfigs();
  const { data: excludedAds } = useExcludedAds();
  const toggleExclusion = useToggleAdExclusion();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingPriceAdvNo, setEditingPriceAdvNo] = useState<string | null>(null);
  const lastClickedRef = useRef<{ groupKey: string; advNo: string } | null>(null);
  const collapseStorageKey = user?.id ? `${COLLAPSE_PREF_KEY_PREFIX}${user.id}` : null;

  const categories = useMemo(() => categorizeAds(ads, buyConfig, sellConfig), [ads, buyConfig, sellConfig]);

  useEffect(() => {
    if (!collapseStorageKey) return;
    try {
      const stored = localStorage.getItem(collapseStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      setCollapsedCategories(new Set(Array.isArray(parsed?.categories) ? parsed.categories : []));
      setCollapsedGroups(new Set(Array.isArray(parsed?.groups) ? parsed.groups : []));
    } catch {
      setCollapsedCategories(new Set());
      setCollapsedGroups(new Set());
    }
  }, [collapseStorageKey]);

  const saveCollapsePrefs = (categoriesSet: Set<string>, groupsSet: Set<string>) => {
    if (!collapseStorageKey) return;
    try {
      localStorage.setItem(collapseStorageKey, JSON.stringify({
        categories: Array.from(categoriesSet),
        groups: Array.from(groupsSet),
      }));
    } catch {
      // Ignore localStorage quota/access failures.
    }
  };

  if (!ads || ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Megaphone className="h-8 w-8 opacity-40" />
        <p className="text-sm">No ads found</p>
      </div>
    );
  }

  const toggleCategory = (key: string) => {
    const next = new Set(collapsedCategories);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedCategories(next);
    saveCollapsePrefs(next, collapsedGroups);
  };

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedGroups(next);
    saveCollapsePrefs(collapsedCategories, next);
  };

  const selectCategoryAds = (category: AdCategory) => {
    const catAdvNos = category.groups.flatMap(g => g.ads.map(a => a.advNo));
    const allSelected = catAdvNos.every(no => selectedAdvNos.has(no));
    const next = new Set(selectedAdvNos);
    if (allSelected) {
      catAdvNos.forEach(no => next.delete(no));
    } else {
      catAdvNos.forEach(no => next.add(no));
    }
    onSelectionChange(next);
  };

  const selectGroupAds = (group: AdGroup) => {
    const groupAdvNos = group.ads.map(a => a.advNo);
    const allSelected = groupAdvNos.every(no => selectedAdvNos.has(no));
    const next = new Set(selectedAdvNos);
    if (allSelected) {
      groupAdvNos.forEach(no => next.delete(no));
    } else {
      groupAdvNos.forEach(no => next.add(no));
    }
    onSelectionChange(next);
  };

  const toggleOne = (advNo: string) => {
    const next = new Set(selectedAdvNos);
    next.has(advNo) ? next.delete(advNo) : next.add(advNo);
    onSelectionChange(next);
  };

  // Row click with shift-range support within a rendered group's ordered list.
  const handleRowSelect = (e: React.MouseEvent, advNo: string, groupKey: string, orderedAds: BinanceAd[]) => {
    const last = lastClickedRef.current;
    if (e.shiftKey && last && last.groupKey === groupKey) {
      const ids = orderedAds.map(a => a.advNo);
      const start = ids.indexOf(last.advNo);
      const end = ids.indexOf(advNo);
      if (start !== -1 && end !== -1) {
        const [lo, hi] = start < end ? [start, end] : [end, start];
        const next = new Set(selectedAdvNos);
        for (let i = lo; i <= hi; i++) next.add(ids[i]);
        onSelectionChange(next);
        lastClickedRef.current = { groupKey, advNo };
        return;
      }
    }
    toggleOne(advNo);
    lastClickedRef.current = { groupKey, advNo };
  };

  const nonEmptyCategories = categories.filter(c => c.groups.some(g => g.ads.length > 0));

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium">
          <TableHead className="w-10"></TableHead>
          <TableHead>Ad ID</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Asset</TableHead>
          <TableHead>Price Type</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Available Qty</TableHead>
          <TableHead className="text-right">Order Limit</TableHead>
          <TableHead>Payment Methods</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nonEmptyCategories.map(category => {
          const catAdvNos = category.groups.flatMap(g => g.ads.map(a => a.advNo));
          const catAllSelected = catAdvNos.length > 0 && catAdvNos.every(no => selectedAdvNos.has(no));
          const catSomeSelected = catAdvNos.some(no => selectedAdvNos.has(no)) && !catAllSelected;
          const isCatCollapsed = collapsedCategories.has(category.key);
          const totalAds = catAdvNos.length;

          return [
            // Category header row
            <TableRow key={`cat-${category.key}`} className="bg-muted/50 hover:bg-muted/70 border-t border-border">
              <TableCell className="py-2">
                <Checkbox
                  checked={catAllSelected}
                  ref={(el) => { if (el) (el as any).indeterminate = catSomeSelected; }}
                  onCheckedChange={() => selectCategoryAds(category)}
                  aria-label={`Select all ${category.label}`}
                />
              </TableCell>
              <TableCell colSpan={11} className="py-2">
                <button
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => toggleCategory(category.key)}
                >
                  {isCatCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <Badge variant="outline" className={`${category.colorClass} font-semibold text-xs`}>
                    {category.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">({totalAds} ad{totalAds !== 1 ? 's' : ''})</span>
                </button>
              </TableCell>
            </TableRow>,

            // Sub-groups (only when category is expanded)
            ...(!isCatCollapsed ? category.groups.filter(g => g.ads.length > 0).flatMap(group => {
              const groupAdvNos = group.ads.map(a => a.advNo);
              const groupAllSelected = groupAdvNos.length > 0 && groupAdvNos.every(no => selectedAdvNos.has(no));
              const groupSomeSelected = groupAdvNos.some(no => selectedAdvNos.has(no)) && !groupAllSelected;
              const isGroupCollapsed = collapsedGroups.has(group.key);

              return [
                // Sub-group header
                <TableRow key={`grp-${group.key}`} className="bg-muted/30 hover:bg-muted/40">
                  <TableCell className="py-1.5 pl-8">
                    <Checkbox
                      checked={groupAllSelected}
                      ref={(el) => { if (el) (el as any).indeterminate = groupSomeSelected; }}
                      onCheckedChange={() => selectGroupAds(group)}
                      aria-label={`Select all ${group.subLabel}`}
                    />
                  </TableCell>
                  <TableCell colSpan={11} className="py-1.5">
                    <button
                      className="flex items-center gap-2 w-full text-left pl-4"
                      onClick={() => toggleGroup(group.key)}
                    >
                      {isGroupCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.subLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground">({group.ads.length})</span>
                    </button>
                  </TableCell>
                </TableRow>,

                // Ad rows
                ...(!isGroupCollapsed ? applyAdSort(group.ads, sortMode).map((ad, adIdx, orderedAds) => (
                  <TableRow key={ad.advNo} data-state={selectedAdvNos.has(ad.advNo) ? 'selected' : undefined} className={compact ? 'text-xs [&>td]:py-1.5' : undefined}>
                    <TableCell className="pl-12">
                      <Checkbox
                        checked={selectedAdvNos.has(ad.advNo)}
                        onClick={(e) => handleRowSelect(e, ad.advNo, group.key, orderedAds)}
                        aria-label={`Select ad ${ad.advNo}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span>{ad.advNo?.slice(-8) || '—'}</span>
                        <AccountBadge accountId={ad._exchangeAccountId} showName={false} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline" className={ad.tradeType === 'BUY' ? 'bg-success/10 text-success border-success/20' : 'bg-destructive/10 text-destructive border-destructive/20'}>
                          {ad.tradeType}
                        </Badge>
                        {isBlockAd(ad) && (
                          <Badge variant="outline" className="border-border bg-secondary text-[10px] text-secondary-foreground">
                            Block
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{ad.asset}</TableCell>
                    <TableCell>
                      <span className="text-xs">{ad.priceType === 1 ? 'Fixed' : 'Floating'}</span>
                    </TableCell>
                    <AdPriceCell
                      ad={ad}
                      isEditing={editingPriceAdvNo === ad.advNo}
                      onRequestEdit={() => setEditingPriceAdvNo(ad.advNo)}
                      onClose={() => setEditingPriceAdvNo(prev => (prev === ad.advNo ? null : prev))}
                    />
                    <TableCell className="text-right tabular-nums">
                      {Number(ad.surplusAmount || 0).toLocaleString('en-IN')} {ad.asset}
                      <div className="text-xs text-muted-foreground">
                        / {Number(ad.initAmount || 0).toLocaleString('en-IN')} total
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      ₹{Number(ad.minSingleTransAmount || 0).toLocaleString('en-IN')} ~ ₹{Number(ad.maxSingleTransAmount || 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(ad.tradeMethods || []).slice(0, 3).map((m, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <PaymentMethodBadge identifier={m.identifier} payType={m.payType} size="sm" />
                            {formatCommissionRate(ad, m.identifier || m.payType) && (
                              <span className="text-[10px] text-muted-foreground tabular-nums">{formatCommissionRate(ad, m.identifier || m.payType)}</span>
                            )}
                          </div>
                        ))}
                        {(ad.tradeMethods || []).length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            +{ad.tradeMethods.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          ad.advStatus === BINANCE_AD_STATUS.ONLINE ? 'bg-success/10 text-success border-success/20'
                          : ad.advStatus === BINANCE_AD_STATUS.PRIVATE ? 'bg-warning/10 text-warning border-warning/20'
                          : 'bg-muted text-muted-foreground border-border'
                        }
                      >
                        {getAdStatusLabel(ad.advStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ad.updateTime ? (
                        <div className="flex flex-col">
                          <span>{format(new Date(ad.updateTime), 'dd MMM yyyy HH:mm')}</span>
                          {(() => {
                            const mins = Math.floor((Date.now() - new Date(ad.updateTime).getTime()) / 60000);
                            if (mins <= 30) return null;
                            const label = mins >= 60 ? `${Math.floor(mins / 60)}h ago` : `${mins}m ago`;
                            return <span className="text-warning">{label}</span>;
                          })()}
                        </div>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon" aria-label="Block / Unblock"
                                className="h-8 w-8"
                                onClick={() => toggleExclusion.mutate({ advNo: ad.advNo, exclude: !excludedAds?.has(ad.advNo) })}
                                disabled={toggleExclusion.isPending}
                              >
                                {excludedAds?.has(ad.advNo) ? (
                                  <ShieldBan className="h-3.5 w-3.5 text-destructive" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {excludedAds?.has(ad.advNo) ? 'Excluded from automation — click to include' : 'Click to exclude from automation'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                         <Button variant="ghost" size="icon" aria-label="Edit" className="h-8 w-8" onClick={() => onEdit(ad)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <QuickEditPopover ad={ad}>
                          <Button variant="ghost" size="icon" aria-label="Quick edit" className="h-8 w-8" title="Quick Edit">
                            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </QuickEditPopover>
                        {onDuplicate && (
                          <Button variant="ghost" size="icon" aria-label="Duplicate" className="h-8 w-8" onClick={() => onDuplicate(ad)} title="Duplicate ad">
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        {onHistory && (
                          <Button variant="ghost" size="icon" aria-label="History" className="h-8 w-8" onClick={() => onHistory(ad.advNo)} title="View change history">
                            <History className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon" aria-label="Disable / Locked"
                          className="h-8 w-8"
                          onClick={() => onToggleStatus(ad.advNo, ad.advStatus)}
                          disabled={isTogglingStatus}
                          title={ad.advStatus === BINANCE_AD_STATUS.ONLINE ? 'Take Offline' : 'Go Online'}
                        >
                          {ad.advStatus === BINANCE_AD_STATUS.ONLINE ? (
                            <PowerOff className="h-3.5 w-3.5 text-trade-sell" />
                          ) : ad.advStatus === BINANCE_AD_STATUS.PRIVATE ? (
                            <Lock className="h-3.5 w-3.5 text-warning" />
                          ) : (
                            <Power className="h-3.5 w-3.5 text-trade-buy" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : []),
              ];
            }) : []),
          ];
        })}
      </TableBody>
    </Table>
  );
}
