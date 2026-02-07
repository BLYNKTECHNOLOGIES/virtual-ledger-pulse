import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Power, PowerOff } from 'lucide-react';
import { BinanceAd } from '@/hooks/useBinanceAds';
import { format } from 'date-fns';

interface AdTableProps {
  ads: BinanceAd[];
  onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  isTogglingStatus: boolean;
}

export function AdTable({ ads, onEdit, onToggleStatus, isTogglingStatus }: AdTableProps) {
  if (!ads || ads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No ads found</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
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
        {ads.map((ad) => (
          <TableRow key={ad.advNo}>
            <TableCell className="font-mono text-xs">{ad.advNo?.slice(-8) || '—'}</TableCell>
            <TableCell>
              <Badge variant={ad.tradeType === 'BUY' ? 'default' : 'secondary'} className={ad.tradeType === 'BUY' ? 'bg-green-600' : 'bg-red-500'}>
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
                <span className="text-xs text-muted-foreground ml-1">({ad.priceFloatingRatio}%)</span>
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
              <div className="flex flex-wrap gap-1 max-w-[150px]">
                {(ad.tradeMethods || []).slice(0, 3).map((m, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                    {m.payType || m.identifier}
                  </Badge>
                ))}
                {(ad.tradeMethods || []).length > 3 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    +{ad.tradeMethods.length - 3}
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={ad.advStatus === 1 ? 'default' : 'secondary'} className={ad.advStatus === 1 ? 'bg-emerald-600' : ''}>
                {ad.advStatus === 1 ? 'Active' : 'Inactive'}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {ad.updateTime ? format(new Date(ad.updateTime), 'dd MMM yyyy HH:mm') : '—'}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(ad)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onToggleStatus(ad.advNo, ad.advStatus)}
                  disabled={isTogglingStatus}
                >
                  {ad.advStatus === 1 ? (
                    <PowerOff className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <Power className="h-3.5 w-3.5 text-green-600" />
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
