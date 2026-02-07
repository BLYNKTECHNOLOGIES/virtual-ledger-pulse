import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw } from 'lucide-react';
import { AdFilters } from '@/hooks/useBinanceAds';

interface AdManagerFiltersProps {
  filters: AdFilters;
  onFiltersChange: (filters: AdFilters) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function AdManagerFilters({ filters, onFiltersChange, onRefresh, isRefreshing }: AdManagerFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={filters.asset || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, asset: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Asset" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Coins</SelectItem>
          <SelectItem value="USDT">USDT</SelectItem>
          <SelectItem value="BTC">BTC</SelectItem>
          <SelectItem value="ETH">ETH</SelectItem>
          <SelectItem value="BNB">BNB</SelectItem>
          <SelectItem value="USDC">USDC</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.tradeType || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, tradeType: v === 'all' ? '' : v, page: 1 })}
      >
        <SelectTrigger className="w-[130px]">
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
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="1">Active</SelectItem>
          <SelectItem value="2">Inactive</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.priceType !== null && filters.priceType !== undefined ? String(filters.priceType) : 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, priceType: v === 'all' ? null : Number(v), page: 1 })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Price Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Price Types</SelectItem>
          <SelectItem value="1">Fixed</SelectItem>
          <SelectItem value="2">Floating</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={filters.startDate || ''}
        onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value, page: 1 })}
        className="w-[150px]"
        placeholder="Start Date"
      />
      <span className="text-muted-foreground">→</span>
      <Input
        type="date"
        value={filters.endDate || ''}
        onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value, page: 1 })}
        className="w-[150px]"
        placeholder="End Date"
      />

      <Button
        variant="outline"
        size="sm"
        onClick={() => onFiltersChange({ page: 1, rows: 20 })}
      >
        Reset
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}
