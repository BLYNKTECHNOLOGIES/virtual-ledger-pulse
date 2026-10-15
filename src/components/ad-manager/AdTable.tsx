import { useMemo, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from './SelectCheckbox';
import { Megaphone, ArrowUp, ArrowDown, ArrowDownUp } from 'lucide-react';
import { useAdAutomationMap } from './AdAutomationIndicator';
import { useAuth } from '@/hooks/useAuth';
import { isSuperAdminRoleName } from '@/lib/auth/roles';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { AdSortMode, applyAdSort } from './CategorizedAdTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useExcludedAds, useToggleAdExclusion } from '@/hooks/useAdAutomationExclusion';
import { cn } from '@/lib/utils';
import {
  AD_LIST_BREAKPOINT, CHIP_LABEL_WIDE, AdIdentity, AdLimits, AdMethods, AdPriceValue, AdRemaining, AdRowActions, AdStatusControl, AdUpdated, useWidthBelow,
} from './AdRowParts';
import { limitsText, qty } from './adUi';

const PAGE = 200;
interface DeskTableProps {
  ads: BinanceAd[];
   onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  onHistory?: (advNo: string) => void;
  onDuplicate?: (ad: BinanceAd) => void;
  isTogglingStatus: boolean;
  selectedAdvNos: Set<string>;
  onSelectionChange: (advNos: Set<string>) => void;
  sortMode?: AdSortMode;
  onSortModeChange?: (mode: AdSortMode) => void;
  compact?: boolean;
}

function SortHeader({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; className?: string }) {
  return (
    <TableHead className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className={cn('inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active && 'text-foreground')}
        onClick={onClick}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDownUp className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );
}

export function DeskTable({ ads, onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, selectedAdvNos, onSelectionChange, sortMode = 'current', onSortModeChange, compact = false }: DeskTableProps) {
  const { data: excludedAds } = useExcludedAds();
  const toggleExclusion = useToggleAdExclusion();
  const automationMap = useAdAutomationMap();
  const { user } = useAuth();
  const isSuperAdmin = !!user?.roles?.some(isSuperAdminRoleName);
  const [editingPriceAdvNo, setEditingPriceAdvNo] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const lastClickedRef = useRef<string | null>(null);
  const [wrapRef, narrow] = useWidthBelow(AD_LIST_BREAKPOINT);

  const sorted = useMemo(() => applyAdSort(ads, sortMode), [ads, sortMode]);
  const shown = sorted.slice(0, visible);

  if (!ads || ads.length === 0) {
    return <EmptyState icon={Megaphone} title="No ads found" description="Nothing matches this tab, status and filters." className="rounded-lg border border-dashed border-border py-12" />;
  }

  const allSelected = shown.length > 0 && shown.every(ad => selectedAdvNos.has(ad.advNo));
  const someSelected = shown.some(ad => selectedAdvNos.has(ad.advNo)) && !allSelected;

  const toggleAll = () => {
    const next = new Set(selectedAdvNos);
    if (allSelected) shown.forEach(ad => next.delete(ad.advNo));
    else shown.forEach(ad => next.add(ad.advNo));
    onSelectionChange(next);
  };

  const handleRowSelect = (e: React.MouseEvent, advNo: string) => {
    const ids = shown.map(a => a.advNo);
    if (e.shiftKey && lastClickedRef.current) {
      const start = ids.indexOf(lastClickedRef.current);
      const end = ids.indexOf(advNo);
      if (start !== -1 && end !== -1) {
        const [lo, hi] = start < end ? [start, end] : [end, start];
        const next = new Set(selectedAdvNos);
        for (let i = lo; i <= hi; i++) next.add(ids[i]);
        onSelectionChange(next);
        lastClickedRef.current = advNo;
        return;
      }
    }
    const next = new Set(selectedAdvNos);
    next.has(advNo) ? next.delete(advNo) : next.add(advNo);
    onSelectionChange(next);
    lastClickedRef.current = advNo;
  };

  const cycleSort = (asc: AdSortMode, desc: AdSortMode) => {
    if (!onSortModeChange) return;
    onSortModeChange(sortMode === desc ? asc : desc);
  };

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

  const priceActive = sortMode === 'price-asc' || sortMode === 'price-desc';
  const availActive = sortMode === 'avail-asc' || sortMode === 'avail-desc';

  return (
    <div ref={wrapRef} className="@container min-w-0">
      {narrow ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
            <label className="flex items-center gap-2 font-medium text-foreground">
              <Checkbox
                checked={allSelected}
                ref={(el) => { if (el) (el as unknown as { indeterminate: boolean }).indeterminate = someSelected; }}
                onCheckedChange={toggleAll}
                aria-label="Select all ads"
              />
              Select all {shown.length}
            </label>
            <span className="ml-auto flex items-center gap-1">
              <span>Sort</span>
              {[
                { label: 'Price', on: priceActive, dir: sortMode === 'price-asc' ? 'asc' : 'desc', go: () => cycleSort('price-asc', 'price-desc') },
                { label: 'Remaining', on: availActive, dir: sortMode === 'avail-asc' ? 'asc' : 'desc', go: () => cycleSort('avail-asc', 'avail-desc') },
                { label: 'Updated', on: sortMode === 'updated-desc', dir: 'desc', go: () => cycleSort('updated-desc', 'updated-desc') },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={s.go}
                  className={cn('inline-flex h-6 items-center gap-0.5 rounded-md border px-1.5', s.on ? 'border-primary/30 bg-primary/10 text-foreground' : 'border-border hover:text-foreground')}
                >
                  {s.label}
                  {s.on && (s.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              ))}
            </span>
          </div>
          <ul className="divide-y divide-border" aria-label="Ads">
            {shown.map((ad) => {
              const selected = selectedAdvNos.has(ad.advNo);
              const off = ad.advStatus === BINANCE_AD_STATUS.OFFLINE;
              return (
                <li key={ad.advNo} className={cn('flex gap-2.5 px-3 py-3 transition-colors', selected && 'bg-primary/[0.06]')}>
                  <Checkbox className="mt-0.5" checked={selected} onClick={(e) => handleRowSelect(e, ad.advNo)} aria-label={`Select ad ${ad.advNo}`} />
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
        </div>
      ) : (
        <Table density={compact ? 'compact' : 'comfortable'} className="[overflow-wrap:normal]" containerClassName="bg-card">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => { if (el) (el as unknown as { indeterminate: boolean }).indeterminate = someSelected; }}
                  onCheckedChange={toggleAll}
                  aria-label="Select all ads"
                />
              </TableHead>
              <TableHead>Ad</TableHead>
              <SortHeader label="Price" active={priceActive} dir={sortMode === 'price-asc' ? 'asc' : 'desc'} onClick={() => cycleSort('price-asc', 'price-desc')} className="text-right" />
              <SortHeader label="Remaining" active={availActive} dir={sortMode === 'avail-asc' ? 'asc' : 'desc'} onClick={() => cycleSort('avail-asc', 'avail-desc')} className="text-right" />
              <TableHead className="text-right">Order limit</TableHead>
              <TableHead className="hidden @[64rem]:table-cell">Methods</TableHead>
              <TableHead>Status</TableHead>
              <SortHeader label="Updated" active={sortMode === 'updated-desc'} dir="desc" onClick={() => cycleSort('updated-desc', 'updated-desc')} className="hidden @[80rem]:table-cell" />
              <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((ad) => {
              const off = ad.advStatus === BINANCE_AD_STATUS.OFFLINE;
              const dim = off ? 'opacity-60' : undefined;
              return (
                <TableRow key={ad.advNo} data-state={selectedAdvNos.has(ad.advNo) ? 'selected' : undefined} className={compact ? 'text-xs' : undefined}>
                  <TableCell className="w-10">
                    <Checkbox
                      checked={selectedAdvNos.has(ad.advNo)}
                      onClick={(e) => handleRowSelect(e, ad.advNo)}
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
            })}
          </TableBody>
        </Table>
      )}
      {visible < sorted.length && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={() => setVisible(v => v + PAGE)}>
            Show more ({sorted.length - visible} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
