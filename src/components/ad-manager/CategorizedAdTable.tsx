import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, Megaphone } from 'lucide-react';
import { useAdAutomationMap } from './AdAutomationIndicator';
import { isSuperAdminRoleName } from '@/lib/auth/roles';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useState } from 'react';
import { useExcludedAds, useToggleAdExclusion } from '@/hooks/useAdAutomationExclusion';
import { useAuth } from '@/hooks/useAuth';
import { isBlockAd } from '@/lib/adZone';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import {
  AD_LIST_BREAKPOINT, CHIP_LABEL_WIDE, AdIdentity, AdLimits, AdMethods, AdPriceValue, AdRemaining, AdRowActions, AdStatusControl, AdUpdated, useWidthBelow,
} from './AdRowParts';
import { limitsText, qty } from './adUi';

export { stalePriceLabel } from './adUi';

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

  // Asset ordering: Fixed groups use USDT → USDC → FDUSD; Floating groups use
  // BTC → BNB → ETH → TRX → SOL → XRP → SHIB. Unknown assets fall to the end.
  // Within each coin, higher-priced ads are placed on top (price descending).
  const FIXED_ASSET_ORDER = ['USDT', 'USDC', 'FDUSD'];
  const FLOATING_ASSET_ORDER = ['BTC', 'BNB', 'ETH', 'TRX', 'SOL', 'XRP', 'SHIB'];
  const assetRank = (asset: string, isFixed: boolean) => {
    const order = isFixed ? FIXED_ASSET_ORDER : FLOATING_ASSET_ORDER;
    const idx = order.indexOf(String(asset || '').toUpperCase());
    return idx === -1 ? order.length : idx;
  };
  const sortGroup = (list: BinanceAd[], isFixed: boolean) =>
    [...list].sort((a, b) => {
      const rankCmp = assetRank(a.asset, isFixed) - assetRank(b.asset, isFixed);
      if (rankCmp !== 0) return rankCmp;
      const assetCmp = String(a.asset || '').localeCompare(String(b.asset || ''));
      if (assetCmp !== 0) return assetCmp;
      return Number(b.price || 0) - Number(a.price || 0);
    });

  buckets.blockFixed = sortGroup(buckets.blockFixed, true);
  buckets.blockFloating = sortGroup(buckets.blockFloating, false);
  buckets.smallBuyFixed = sortGroup(buckets.smallBuyFixed, true);
  buckets.smallBuyFloating = sortGroup(buckets.smallBuyFloating, false);
  buckets.bigBuyFixed = sortGroup(buckets.bigBuyFixed, true);
  buckets.bigBuyFloating = sortGroup(buckets.bigBuyFloating, false);
  buckets.smallSellFixed = sortGroup(buckets.smallSellFixed, true);
  buckets.smallSellFloating = sortGroup(buckets.smallSellFloating, false);
  buckets.bigSellFixed = sortGroup(buckets.bigSellFixed, true);
  buckets.bigSellFloating = sortGroup(buckets.bigSellFloating, false);

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
  const automationMap = useAdAutomationMap();
  const isSuperAdmin = !!user?.roles?.some(isSuperAdminRoleName);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingPriceAdvNo, setEditingPriceAdvNo] = useState<string | null>(null);
  const lastClickedRef = useRef<{ groupKey: string; advNo: string } | null>(null);
  const collapseStorageKey = user?.id ? `${COLLAPSE_PREF_KEY_PREFIX}${user.id}` : null;
  const [wrapRef, narrow] = useWidthBelow(AD_LIST_BREAKPOINT);

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
    return <EmptyState icon={Megaphone} title="No ads found" description="Nothing matches this tab, status and filters." className="rounded-lg border border-dashed border-border py-12" />;
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

  const rowProps = (ad: BinanceAd) => ({
    excluded: !!excludedAds?.has(ad.advNo),
    onToggleExclusion: () => toggleExclusion.mutate({ advNo: ad.advNo, exclude: !excludedAds?.has(ad.advNo) }),
    exclusionPending: toggleExclusion.isPending,
  });
  const priceProps = (ad: BinanceAd) => ({
    isEditing: editingPriceAdvNo === ad.advNo,
    onRequestEdit: () => setEditingPriceAdvNo(ad.advNo),
    onClose: () => setEditingPriceAdvNo(prev => (prev === ad.advNo ? null : prev)),
  });

  const catState = (category: AdCategory) => {
    const catAdvNos = category.groups.flatMap(g => g.ads.map(a => a.advNo));
    const catAllSelected = catAdvNos.length > 0 && catAdvNos.every(no => selectedAdvNos.has(no));
    const catSomeSelected = catAdvNos.some(no => selectedAdvNos.has(no)) && !catAllSelected;
    const active = category.groups.reduce((n, g) => n + g.ads.filter(a => a.advStatus !== BINANCE_AD_STATUS.OFFLINE).length, 0);
    return { catAdvNos, catAllSelected, catSomeSelected, isCatCollapsed: collapsedCategories.has(category.key), totalAds: catAdvNos.length, active };
  };
  const groupState = (group: AdGroup) => {
    const groupAdvNos = group.ads.map(a => a.advNo);
    const groupAllSelected = groupAdvNos.length > 0 && groupAdvNos.every(no => selectedAdvNos.has(no));
    const groupSomeSelected = groupAdvNos.some(no => selectedAdvNos.has(no)) && !groupAllSelected;
    return { groupAllSelected, groupSomeSelected, isGroupCollapsed: collapsedGroups.has(group.key) };
  };

  // Plain render helpers (not components), so the toggle buttons keep their identity and focus across renders.
  const categoryLabel = ({ category, totalAds, active, collapsed }: { category: AdCategory; totalAds: number; active: number; collapsed: boolean }) => (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => toggleCategory(category.key)}
      aria-expanded={!collapsed}
    >
      {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      <span className={cn('inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold', category.colorClass)}>{category.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{totalAds} ad{totalAds !== 1 ? 's' : ''}</span>
      <span className="ml-auto pr-1 text-[11px] text-muted-foreground tabular-nums">{active} on</span>
    </button>
  );
  const groupLabel = ({ group, collapsed }: { group: AdGroup; collapsed: boolean }) => (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => toggleGroup(group.key)}
      aria-expanded={!collapsed}
    >
      {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      <span className="text-xs font-medium text-foreground">{group.subLabel}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{group.ads.length}</span>
    </button>
  );

  return (
    <div ref={wrapRef} className="@container min-w-0">
    {narrow ? (
      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
        {nonEmptyCategories.map(category => {
          const c = catState(category);
          return (
            <section key={`cat-${category.key}`} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-2.5 bg-secondary/40 px-3 py-2">
                <Checkbox
                  checked={c.catAllSelected}
                  ref={(el) => { if (el) (el as unknown as { indeterminate: boolean }).indeterminate = c.catSomeSelected; }}
                  onCheckedChange={() => selectCategoryAds(category)}
                  aria-label={`Select all ${category.label}`}
                />
                {categoryLabel({ category, totalAds: c.totalAds, active: c.active, collapsed: c.isCatCollapsed })}
              </div>
              {!c.isCatCollapsed && category.groups.filter(g => g.ads.length > 0).map(group => {
                const g = groupState(group);
                return (
                  <div key={`grp-${group.key}`}>
                    <div className="flex items-center gap-2.5 border-t border-border/60 bg-secondary/20 py-1.5 pl-6 pr-3">
                      <Checkbox
                        checked={g.groupAllSelected}
                        ref={(el) => { if (el) (el as unknown as { indeterminate: boolean }).indeterminate = g.groupSomeSelected; }}
                        onCheckedChange={() => selectGroupAds(group)}
                        aria-label={`Select all ${group.subLabel}`}
                      />
                      {groupLabel({ group, collapsed: g.isGroupCollapsed })}
                    </div>
                    {!g.isGroupCollapsed && (
                      <ul className="divide-y divide-border/70" aria-label={`${category.label} · ${group.subLabel}`}>
                        {applyAdSort(group.ads, sortMode).map((ad, adIdx, orderedAds) => {
                          const selected = selectedAdvNos.has(ad.advNo);
                          const off = ad.advStatus === BINANCE_AD_STATUS.OFFLINE;
                          return (
                            <li key={ad.advNo} className={cn('flex gap-2.5 border-t border-border/70 py-3 pl-6 pr-3 transition-colors', selected && 'bg-primary/[0.06]')}>
                              <Checkbox className="mt-0.5" checked={selected} onClick={(e) => handleRowSelect(e, ad.advNo, group.key, orderedAds)} aria-label={`Select ad ${ad.advNo}`} />
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className={cn('flex items-start justify-between gap-2', off && 'opacity-70')}>
                                  <AdIdentity ad={ad} automation={automationMap.get(ad.advNo)} excluded={!!excludedAds?.has(ad.advNo)} />
                                  <div className="shrink-0 text-right text-sm"><AdPriceValue ad={ad} {...priceProps(ad)} /></div>
                                </div>
                                <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums', off && 'opacity-70')}>
                                  <span className={Number(ad.surplusAmount || 0) <= 0 ? 'text-destructive' : undefined}>{qty(ad.surplusAmount)} / {qty(ad.initAmount)} {ad.asset}</span>
                                  <span>{limitsText(ad)}</span>
                                </div>
                                <div className={cn('flex flex-wrap items-center justify-between gap-2', off && 'opacity-70')}>
                                  <AdMethods ad={ad} />
                                  <AdUpdated ad={ad} />
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <AdStatusControl ad={ad} onToggleStatus={onToggleStatus} isTogglingStatus={isTogglingStatus} />
                                  <AdRowActions ad={ad} onEdit={onEdit} onDuplicate={onDuplicate} onHistory={onHistory} canHistory={isSuperAdmin} {...rowProps(ad)} />
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    ) : (
    <Table density={compact ? 'compact' : 'comfortable'} className="[overflow-wrap:normal]" containerClassName="bg-card">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
          <TableHead>Ad</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Remaining</TableHead>
          <TableHead className="text-right">Order limit</TableHead>
          <TableHead className="hidden @[64rem]:table-cell">Methods</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden @[80rem]:table-cell">Updated</TableHead>
          <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nonEmptyCategories.map(category => {
          const c = catState(category);

          return [
            // Category header row
            <TableRow key={`cat-${category.key}`} className="bg-secondary/40 hover:bg-secondary/60">
              <TableCell className="w-10 py-2">
                <Checkbox
                  checked={c.catAllSelected}
                  ref={(el) => { if (el) (el as unknown as { indeterminate: boolean }).indeterminate = c.catSomeSelected; }}
                  onCheckedChange={() => selectCategoryAds(category)}
                  aria-label={`Select all ${category.label}`}
                />
              </TableCell>
              <TableCell colSpan={8} className="py-2">
                {categoryLabel({ category, totalAds: c.totalAds, active: c.active, collapsed: c.isCatCollapsed })}
              </TableCell>
            </TableRow>,

            // Sub-groups (only when category is expanded)
            ...(!c.isCatCollapsed ? category.groups.filter(g => g.ads.length > 0).flatMap(group => {
              const g = groupState(group);

              return [
                // Sub-group header
                <TableRow key={`grp-${group.key}`} className="bg-secondary/20 hover:bg-secondary/30">
                  <TableCell className="w-10 py-1.5 pl-6">
                    <Checkbox
                      checked={g.groupAllSelected}
                      ref={(el) => { if (el) (el as unknown as { indeterminate: boolean }).indeterminate = g.groupSomeSelected; }}
                      onCheckedChange={() => selectGroupAds(group)}
                      aria-label={`Select all ${group.subLabel}`}
                    />
                  </TableCell>
                  <TableCell colSpan={8} className="py-1.5 pl-4">
                    {groupLabel({ group, collapsed: g.isGroupCollapsed })}
                  </TableCell>
                </TableRow>,

                // Ad rows
                ...(!g.isGroupCollapsed ? applyAdSort(group.ads, sortMode).map((ad, adIdx, orderedAds) => {
                  const off = ad.advStatus === BINANCE_AD_STATUS.OFFLINE;
                  const dim = off ? 'opacity-60' : undefined;
                  return (
                  <TableRow key={ad.advNo} data-state={selectedAdvNos.has(ad.advNo) ? 'selected' : undefined} className={compact ? 'text-xs' : undefined}>
                    <TableCell className="w-10 pl-9">
                      <Checkbox
                        checked={selectedAdvNos.has(ad.advNo)}
                        onClick={(e) => handleRowSelect(e, ad.advNo, group.key, orderedAds)}
                        aria-label={`Select ad ${ad.advNo}`}
                      />
                    </TableCell>
                    <TableCell className={cn('min-w-[9.5rem] @[64rem]:min-w-[13.5rem]', dim)}>
                      <AdIdentity ad={ad} automation={automationMap.get(ad.advNo)} excluded={!!excludedAds?.has(ad.advNo)} chipLabelClassName={CHIP_LABEL_WIDE} />
                    </TableCell>
                    <TableCell className={cn('text-right', dim)}>
                      <AdPriceValue ad={ad} {...priceProps(ad)} />
                    </TableCell>
                    <TableCell className={cn('text-right', dim)}><AdRemaining ad={ad} bar={!compact} /></TableCell>
                    <TableCell className={cn('text-right text-xs', dim)}>
                      <AdLimits ad={ad} />
                      <div className="mt-1 flex justify-end @[64rem]:hidden"><AdMethods ad={ad} max={2} fee="summary" className="justify-end" /></div>
                    </TableCell>
                    <TableCell className={cn('hidden min-w-[8rem] @[64rem]:table-cell', dim)}><AdMethods ad={ad} /></TableCell>
                    <TableCell className="min-w-[8.5rem]">
                      <AdStatusControl ad={ad} onToggleStatus={onToggleStatus} isTogglingStatus={isTogglingStatus} />
                      <div className="mt-1 @[80rem]:hidden"><AdUpdated ad={ad} /></div>
                    </TableCell>
                    <TableCell className="hidden @[80rem]:table-cell"><AdUpdated ad={ad} /></TableCell>
                    <TableCell className="text-right">
                      <AdRowActions ad={ad} onEdit={onEdit} onDuplicate={onDuplicate} onHistory={onHistory} canHistory={isSuperAdmin} {...rowProps(ad)} />
                    </TableCell>
                  </TableRow>
                  );
                }) : []),
              ];
            }) : []),
          ];
        })}
      </TableBody>
    </Table>
    )}
    </div>
  );
}
