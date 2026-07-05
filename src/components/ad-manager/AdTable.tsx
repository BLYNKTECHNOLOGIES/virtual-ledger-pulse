import { useMemo, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Power, PowerOff, Lock, ShieldBan, ShieldCheck, Megaphone, ArrowUp, ArrowDown, History, Copy, Zap } from 'lucide-react';
import { BinanceAd, getAdStatusLabel, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { InlinePriceEditor } from './InlinePriceEditor';
import { QuickEditPopover } from './QuickEditPopover';
import { AdSortMode, applyAdSort, stalePriceLabel } from './CategorizedAdTable';
import { AccountBadge } from '@/components/exchange/AccountBadge';
import { format } from 'date-fns';
import { useExcludedAds, useToggleAdExclusion } from '@/hooks/useAdAutomationExclusion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useValueFlash } from '@/hooks/useValueFlash';

const PAGE = 200;

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

function DeskPriceCell({ ad, isEditing, onRequestEdit, onClose }: { ad: BinanceAd; isEditing: boolean; onRequestEdit: () => void; onClose: () => void }) {
  const flash = useValueFlash(Number(ad.price || 0), 'value-flash');
  return (
    <TableCell className={`text-right font-semibold tabular-nums ${flash}`}>
      <InlinePriceEditor ad={ad} isEditing={isEditing} onRequestEdit={onRequestEdit} onClose={onClose} />
    </TableCell>
  );
}

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
    <TableHead className={className}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={onClick}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}

export function DeskTable({ ads, onEdit, onToggleStatus, onHistory, onDuplicate, isTogglingStatus, selectedAdvNos, onSelectionChange, sortMode = 'current', onSortModeChange, compact = false }: DeskTableProps) {
  const { data: excludedAds } = useExcludedAds();
  const toggleExclusion = useToggleAdExclusion();
  const [editingPriceAdvNo, setEditingPriceAdvNo] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const lastClickedRef = useRef<string | null>(null);

  const sorted = useMemo(() => applyAdSort(ads, sortMode), [ads, sortMode]);
  const shown = sorted.slice(0, visible);

  if (!ads || ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Megaphone className="h-8 w-8 opacity-40" />
        <p className="text-sm">No ads found</p>
      </div>
    );
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

  const rowClass = compact ? 'text-xs [&>td]:py-1.5' : undefined;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium">
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                ref={(el) => { if (el) (el as any).indeterminate = someSelected; }}
                onCheckedChange={toggleAll}
                aria-label="Select all ads"
              />
            </TableHead>
            <TableHead>Ad ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Price Type</TableHead>
            <SortHeader label="Price" active={sortMode === 'price-asc' || sortMode === 'price-desc'} dir={sortMode === 'price-asc' ? 'asc' : 'desc'} onClick={() => cycleSort('price-asc', 'price-desc')} className="text-right" />
            <SortHeader label="Available Qty" active={sortMode === 'avail-asc' || sortMode === 'avail-desc'} dir={sortMode === 'avail-asc' ? 'asc' : 'desc'} onClick={() => cycleSort('avail-asc', 'avail-desc')} className="text-right" />
            <TableHead className="text-right">Order Limit</TableHead>
            <TableHead>Payment Methods</TableHead>
            <TableHead>Status</TableHead>
            <SortHeader label="Updated" active={sortMode === 'updated-desc'} dir="desc" onClick={() => cycleSort('updated-desc', 'updated-desc')} />
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((ad) => {
            const staleAge = stalePriceLabel(ad.updateTime);
            return (
              <TableRow key={ad.advNo} data-state={selectedAdvNos.has(ad.advNo) ? 'selected' : undefined} className={rowClass}>
                <TableCell>
                  <Checkbox
                    checked={selectedAdvNos.has(ad.advNo)}
                    onClick={(e) => handleRowSelect(e, ad.advNo)}
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
                      <Badge variant="outline" className="border-border bg-secondary text-[10px] text-secondary-foreground">Block</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{ad.asset}</TableCell>
                <TableCell><span className="text-xs">{ad.priceType === 1 ? 'Fixed' : 'Floating'}</span></TableCell>
                <DeskPriceCell
                  ad={ad}
                  isEditing={editingPriceAdvNo === ad.advNo}
                  onRequestEdit={() => setEditingPriceAdvNo(ad.advNo)}
                  onClose={() => setEditingPriceAdvNo(prev => (prev === ad.advNo ? null : prev))}
                />
                <TableCell className="text-right tabular-nums">
                  {Number(ad.surplusAmount || 0).toLocaleString('en-IN')} {ad.asset}
                  <div className="text-xs text-muted-foreground">/ {Number(ad.initAmount || 0).toLocaleString('en-IN')} total</div>
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
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{ad.tradeMethods.length - 3}</Badge>
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
                      {staleAge && <span className="text-warning">{staleAge}</span>}
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
                            {excludedAds?.has(ad.advNo) ? <ShieldBan className="h-3.5 w-3.5 text-destructive" /> : <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />}
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
                      {ad.advStatus === BINANCE_AD_STATUS.ONLINE ? <PowerOff className="h-3.5 w-3.5 text-trade-sell" />
                        : ad.advStatus === BINANCE_AD_STATUS.PRIVATE ? <Lock className="h-3.5 w-3.5 text-warning" />
                        : <Power className="h-3.5 w-3.5 text-trade-buy" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {visible < sorted.length && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={() => setVisible(v => v + PAGE)}>
            Show more ({sorted.length - visible} remaining)
          </Button>
        </div>
      )}
    </>
  );
}
