import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { AdFilters } from '@/hooks/useBinanceAds';

interface AdManagerFiltersProps {
  filters: AdFilters;
  onFiltersChange: (filters: AdFilters) => void;
  /** Kept for callers; the page header holds the single Refresh button. */
  onRefresh: () => void;
  isRefreshing: boolean;
  assetOptions?: string[];
}

const DEFAULT_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'USDC'];

const TRIGGER = 'h-8 w-full gap-1.5 text-xs sm:w-auto sm:min-w-[7.5rem]';
const PREFIX = 'shrink-0 text-muted-foreground';

export function AdManagerFilters({ filters, onFiltersChange, assetOptions }: AdManagerFiltersProps) {
  const [open, setOpen] = useState(false);
  const assets = Array.from(new Set([...DEFAULT_ASSETS, ...(assetOptions || [])])).sort();
  const activeCount = [
    !!filters.asset,
    !!filters.tradeType,
    filters.advStatus !== null && filters.advStatus !== undefined,
    !!filters.zone,
    filters.priceType !== null && filters.priceType !== undefined,
  ].filter(Boolean).length;

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:w-auto"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
        {activeCount > 0 && <span className="t-mono rounded bg-primary/15 px-1 text-[10px] tabular-nums text-primary">{activeCount}</span>}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
      <div className="mt-2 grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">

      <Select
        value={filters.asset || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, asset: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className={TRIGGER} aria-label="Coin">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={PREFIX}>Coin</span>
            <span className="min-w-0 truncate"><SelectValue placeholder="Asset" /></span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {assets.map((a) => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>


      <Select
        value={filters.tradeType || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, tradeType: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className={TRIGGER} aria-label="Side">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={PREFIX}>Side</span>
            <span className="min-w-0 truncate"><SelectValue placeholder="Trade Type" /></span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="BUY">Buy</SelectItem>
          <SelectItem value="SELL">Sell</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.advStatus !== null && filters.advStatus !== undefined ? String(filters.advStatus) : 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, advStatus: v === 'all' ? null : Number(v), page: 1 })}
      >
        <SelectTrigger className={TRIGGER} aria-label="Status">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={PREFIX}>Status</span>
            <span className="min-w-0 truncate"><SelectValue placeholder="Status" /></span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="1">Active</SelectItem>
          <SelectItem value="2">Private</SelectItem>
          <SelectItem value="3">Inactive</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.zone || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, zone: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className={TRIGGER} aria-label="Zone">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={PREFIX}>Zone</span>
            <span className="min-w-0 truncate"><SelectValue placeholder="Zone" /></span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="p2p">P2P zone</SelectItem>
          <SelectItem value="block">Block zone</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.priceType !== null && filters.priceType !== undefined ? String(filters.priceType) : 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, priceType: v === 'all' ? null : Number(v), page: 1 })}
      >
        <SelectTrigger className={TRIGGER} aria-label="Price type">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={PREFIX}>Price</span>
            <span className="min-w-0 truncate"><SelectValue placeholder="Price Type" /></span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="1">Fixed</SelectItem>
          <SelectItem value="2">Floating</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onFiltersChange({ page: 1, rows: 50, fetchAll: filters.fetchAll })}
        title="Clear these filters"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </Button>
    </div>
  );
}
