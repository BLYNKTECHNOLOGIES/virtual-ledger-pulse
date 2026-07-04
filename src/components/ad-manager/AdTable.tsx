import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Power, PowerOff, Lock, Megaphone } from 'lucide-react';
import { BinanceAd, getAdStatusLabel, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { format } from 'date-fns';

function formatCommissionRate(ad: BinanceAd, identifier?: string) {
  const list = ad.tradeMethodCommissionRateVoList || [];
  const matched = list.find((item) => String(item.tradeMethodIdentifier || item.tradeMethodName || '') === String(identifier || ''));
  const rate = matched?.commissionRate ?? ad.commissionRate ?? ad.takerCommissionRate;
  if (rate === undefined || rate === null || rate === '') return null;
  return `${(Number(rate) * 100).toFixed(4)}%`;
}

interface AdTableProps {
  ads: BinanceAd[];
  onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  isTogglingStatus: boolean;
  selectedAdvNos: Set<string>;
  onSelectionChange: (advNos: Set<string>) => void;
}

export function AdTable({ ads, onEdit, onToggleStatus, isTogglingStatus, selectedAdvNos, onSelectionChange }: AdTableProps) {
  if (!ads || ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Megaphone className="h-8 w-8 opacity-40" />
        <p className="text-sm">No ads found</p>
      </div>
    );
  }

  const allSelected = ads.length > 0 && ads.every(ad => selectedAdvNos.has(ad.advNo));
  const someSelected = ads.some(ad => selectedAdvNos.has(ad.advNo)) && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(ads.map(ad => ad.advNo)));
    }
  };

  const toggleOne = (advNo: string) => {
    const next = new Set(selectedAdvNos);
    if (next.has(advNo)) next.delete(advNo);
    else next.add(advNo);
    onSelectionChange(next);
  };

  return (
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
        {ads.map((ad) => (
          <TableRow key={ad.advNo} data-state={selectedAdvNos.has(ad.advNo) ? 'selected' : undefined}>
            <TableCell>
              <Checkbox
                checked={selectedAdvNos.has(ad.advNo)}
                onCheckedChange={() => toggleOne(ad.advNo)}
                aria-label={`Select ad ${ad.advNo}`}
              />
            </TableCell>
            <TableCell className="font-mono text-xs">{ad.advNo?.slice(-8) || '—'}</TableCell>
            <TableCell>
              <Badge variant="outline" className={ad.tradeType === 'BUY' ? 'bg-success/10 text-success border-success/20' : 'bg-destructive/10 text-destructive border-destructive/20'}>
                {ad.tradeType}
              </Badge>
            </TableCell>
            <TableCell className="font-medium">{ad.asset}</TableCell>
            <TableCell>
              <span className="text-xs">{ad.priceType === 1 ? 'Fixed' : 'Floating'}</span>
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              ₹{Number(ad.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              {ad.priceType === 2 && ad.priceFloatingRatio && (
                <span className="text-xs text-muted-foreground ml-1">({Number(ad.priceFloatingRatio).toFixed(2)}%)</span>
              )}
            </TableCell>
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
              {ad.updateTime ? format(new Date(ad.updateTime), 'dd MMM yyyy HH:mm') : '—'}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" aria-label="Edit" className="h-8 w-8" onClick={() => onEdit(ad)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
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
        ))}
      </TableBody>
    </Table>
  );
}
