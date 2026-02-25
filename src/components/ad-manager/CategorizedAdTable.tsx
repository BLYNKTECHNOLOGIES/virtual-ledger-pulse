import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Power, PowerOff, Lock, ChevronDown, ChevronRight, ShieldBan, ShieldCheck } from 'lucide-react';
import { BinanceAd, getAdStatusLabel, getAdStatusVariant, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { format } from 'date-fns';
import { useState } from 'react';
import { useExcludedAds, useToggleAdExclusion } from '@/hooks/useAdAutomationExclusion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CategorizedAdTableProps {
  ads: BinanceAd[];
  onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  isTogglingStatus: boolean;
  selectedAdvNos: Set<string>;
  onSelectionChange: (advNos: Set<string>) => void;
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
    const isBuy = ad.tradeType === 'BUY';
    const isFixed = ad.priceType === 1;
    const maxTrans = Number(ad.maxSingleTransAmount || 0);
    const minTrans = Number(ad.minSingleTransAmount || 0);

    if (isBuy) {
      // An ad is "small" if its order limit range falls within the small config range
      const isSmall = maxTrans <= smallBuyMax && minTrans >= smallBuyMin;
      if (isSmall) {
        (isFixed ? buckets.smallBuyFixed : buckets.smallBuyFloating).push(ad);
      } else {
        (isFixed ? buckets.bigBuyFixed : buckets.bigBuyFloating).push(ad);
      }
    } else {
      const isSmall = maxTrans <= smallSellMax && minTrans >= smallSellMin;
      if (isSmall) {
        (isFixed ? buckets.smallSellFixed : buckets.smallSellFloating).push(ad);
      } else {
        (isFixed ? buckets.bigSellFixed : buckets.bigSellFloating).push(ad);
      }
    }
  }

  return [
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

export function CategorizedAdTable({ ads, onEdit, onToggleStatus, isTogglingStatus, selectedAdvNos, onSelectionChange }: CategorizedAdTableProps) {
  const { buyConfig, sellConfig } = useSmallConfigs();
  const { data: excludedAds } = useExcludedAds();
  const toggleExclusion = useToggleAdExclusion();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const categories = useMemo(() => categorizeAds(ads, buyConfig, sellConfig), [ads, buyConfig, sellConfig]);

  if (!ads || ads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No ads found</p>
      </div>
    );
  }

  const toggleCategory = (key: string) => {
    const next = new Set(collapsedCategories);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedCategories(next);
  };

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedGroups(next);
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

  const nonEmptyCategories = categories.filter(c => c.groups.some(g => g.ads.length > 0));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"></TableHead>
          <TableHead>Ad ID</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Asset</TableHead>
          <TableHead>Price Type</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Available Qty</TableHead>
          <TableHead>Order Limit</TableHead>
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
            <TableRow key={`cat-${category.key}`} className="bg-muted/50 hover:bg-muted/70 border-t-2 border-border">
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
                ...(!isGroupCollapsed ? group.ads.map(ad => (
                  <TableRow key={ad.advNo} data-state={selectedAdvNos.has(ad.advNo) ? 'selected' : undefined}>
                    <TableCell className="pl-12">
                      <Checkbox
                        checked={selectedAdvNos.has(ad.advNo)}
                        onCheckedChange={() => toggleOne(ad.advNo)}
                        aria-label={`Select ad ${ad.advNo}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{ad.advNo?.slice(-8) || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={ad.tradeType === 'BUY' ? 'default' : 'secondary'} className={ad.tradeType === 'BUY' ? 'bg-trade-buy text-white' : 'bg-trade-sell text-white'}>
                        {ad.tradeType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{ad.asset}</TableCell>
                    <TableCell>
                      <span className="text-xs">{ad.priceType === 1 ? 'Fixed' : 'Floating'}</span>
                    </TableCell>
                    <TableCell className="font-semibold">
                      ₹{Number(ad.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      {ad.priceType === 2 && ad.priceFloatingRatio && (
                        <span className="text-xs text-muted-foreground ml-1">({Number(ad.priceFloatingRatio).toFixed(2)}%)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {Number(ad.surplusAmount || 0).toLocaleString()} {ad.asset}
                      <div className="text-xs text-muted-foreground">
                        / {Number(ad.initAmount || 0).toLocaleString()} total
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      ₹{Number(ad.minSingleTransAmount || 0).toLocaleString('en-IN')} ~ ₹{Number(ad.maxSingleTransAmount || 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(ad.tradeMethods || []).slice(0, 3).map((m, i) => (
                          <PaymentMethodBadge key={i} identifier={m.identifier} payType={m.payType} size="sm" />
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
                        variant={getAdStatusVariant(ad.advStatus)}
                        className={
                          ad.advStatus === BINANCE_AD_STATUS.ONLINE ? 'bg-success text-white'
                          : ad.advStatus === BINANCE_AD_STATUS.PRIVATE ? 'border-amber-500 text-amber-500'
                          : ''
                        }
                      >
                        {getAdStatusLabel(ad.advStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ad.updateTime ? format(new Date(ad.updateTime), 'dd MMM yyyy HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(ad)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onToggleStatus(ad.advNo, ad.advStatus)}
                          disabled={isTogglingStatus}
                          title={ad.advStatus === BINANCE_AD_STATUS.ONLINE ? 'Take Offline' : 'Go Online'}
                        >
                          {ad.advStatus === BINANCE_AD_STATUS.ONLINE ? (
                            <PowerOff className="h-3.5 w-3.5 text-trade-sell" />
                          ) : ad.advStatus === BINANCE_AD_STATUS.PRIVATE ? (
                            <Lock className="h-3.5 w-3.5 text-amber-500" />
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
