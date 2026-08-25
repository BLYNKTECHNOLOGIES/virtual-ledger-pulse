import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { AdFilters } from '@/hooks/useBinanceAds';

interface AdManagerFiltersProps {
  filters: AdFilters;
  onFiltersChange: (filters: AdFilters) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  assetOptions?: string[];
}

const DEFAULT_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'USDC'];

export function AdManagerFilters({ filters, onFiltersChange, onRefresh, isRefreshing, assetOptions }: AdManagerFiltersProps) {
  const assets = Array.from(new Set([...DEFAULT_ASSETS, ...(assetOptions || [])])).sort();
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
      <Select
        value={filters.asset || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, asset: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className="h-9 w-full sm:w-[130px]">
          <SelectValue placeholder="Asset" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Coins</SelectItem>
          {assets.map((a) => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>


      <Select
        value={filters.tradeType || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, tradeType: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className="h-9 w-full sm:w-[130px]">
          <SelectValue placeholder="Trade Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="BUY">Buy</SelectItem>
          <SelectItem value="SELL">Sell</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.advStatus !== null && filters.advStatus !== undefined ? String(filters.advStatus) : 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, advStatus: v === 'all' ? null : Number(v), page: 1 })}
      >
        <SelectTrigger className="h-9 w-full sm:w-[130px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="1">Active</SelectItem>
          <SelectItem value="2">Private</SelectItem>
          <SelectItem value="3">Inactive</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.zone || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, zone: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className="h-9 w-full sm:w-[140px]">
          <SelectValue placeholder="Zone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Zones</SelectItem>
          <SelectItem value="p2p">P2P zone</SelectItem>
          <SelectItem value="block">Block zone</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.priceType !== null && filters.priceType !== undefined ? String(filters.priceType) : 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, priceType: v === 'all' ? null : Number(v), page: 1 })}
      >
        <SelectTrigger className="h-9 w-full sm:w-[140px]">
          <SelectValue placeholder="Price Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Price Types</SelectItem>
          <SelectItem value="1">Fixed</SelectItem>
          <SelectItem value="2">Floating</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className="h-9 flex-1 sm:flex-none"
        onClick={() => onFiltersChange({ page: 1, rows: 50, fetchAll: filters.fetchAll })}
      >
        Reset
      </Button>

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={onRefresh}
        disabled={isRefreshing}
       aria-label="Refresh">
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}
