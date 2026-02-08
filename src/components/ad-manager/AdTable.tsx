import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Power, PowerOff } from 'lucide-react';
import { BinanceAd } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from './PaymentMethodBadge';
import { format } from 'date-fns';

interface AdTableProps {
  ads: BinanceAd[];
  onEdit: (ad: BinanceAd) => void;
  onToggleStatus: (advNo: string, currentStatus: number) => void;
  isTogglingStatus: boolean;
  darkMode?: boolean;
}

export function AdTable({ ads, onEdit, onToggleStatus, isTogglingStatus, darkMode = false }: AdTableProps) {
  const d = darkMode;

  if (!ads || ads.length === 0) {
    return (
      <div className={`text-center py-12 ${d ? 'text-gray-500' : 'text-muted-foreground'}`}>
        <p className="text-sm">No ads found</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className={d ? 'border-gray-800/60 hover:bg-transparent' : ''}>
          <TableHead className={d ? 'text-gray-500' : ''}>Ad ID</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Type</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Asset</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Price Type</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Price</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Available Qty</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Order Limit</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Payment Methods</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Status</TableHead>
          <TableHead className={d ? 'text-gray-500' : ''}>Updated</TableHead>
          <TableHead className={`text-right ${d ? 'text-gray-500' : ''}`}>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ads.map((ad) => (
          <TableRow key={ad.advNo} className={d ? 'border-gray-800/30 hover:bg-[#0d1321]/60' : ''}>
            <TableCell className={`font-mono text-xs ${d ? 'text-gray-300' : ''}`}>{ad.advNo?.slice(-8) || '—'}</TableCell>
            <TableCell>
              <Badge variant={ad.tradeType === 'BUY' ? 'default' : 'secondary'} className={ad.tradeType === 'BUY' ? 'bg-green-600' : 'bg-red-500'}>
                {ad.tradeType}
              </Badge>
            </TableCell>
            <TableCell className={`font-medium ${d ? 'text-gray-200' : ''}`}>{ad.asset}</TableCell>
            <TableCell>
              <span className={`text-xs ${d ? 'text-gray-400' : ''}`}>{ad.priceType === 1 ? 'Fixed' : 'Floating'}</span>
            </TableCell>
            <TableCell className={`font-semibold ${d ? 'text-gray-100' : ''}`}>
              ₹{Number(ad.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              {ad.priceType === 2 && ad.priceFloatingRatio && (
                <span className={`text-xs ml-1 ${d ? 'text-gray-500' : 'text-muted-foreground'}`}>({ad.priceFloatingRatio}%)</span>
              )}
            </TableCell>
            <TableCell className={d ? 'text-gray-200' : ''}>
              {Number(ad.surplusAmount || 0).toLocaleString()} {ad.asset}
              <div className={`text-xs ${d ? 'text-gray-500' : 'text-muted-foreground'}`}>
                / {Number(ad.initAmount || 0).toLocaleString()} total
              </div>
            </TableCell>
            <TableCell className={`text-xs ${d ? 'text-gray-400' : ''}`}>
              ₹{Number(ad.minSingleTransAmount || 0).toLocaleString('en-IN')} ~ ₹{Number(ad.maxSingleTransAmount || 0).toLocaleString('en-IN')}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1 max-w-[180px]">
                {(ad.tradeMethods || []).slice(0, 3).map((m, i) => (
                  <PaymentMethodBadge key={i} identifier={m.identifier} payType={m.payType} size="sm" />
                ))}
                {(ad.tradeMethods || []).length > 3 && (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${d ? 'border-gray-700 text-gray-400' : ''}`}>
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
            <TableCell className={`text-xs ${d ? 'text-gray-500' : 'text-muted-foreground'}`}>
              {ad.updateTime ? format(new Date(ad.updateTime), 'dd MMM yyyy HH:mm') : '—'}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${d ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : ''}`} onClick={() => onEdit(ad)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${d ? 'hover:bg-gray-800' : ''}`}
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
