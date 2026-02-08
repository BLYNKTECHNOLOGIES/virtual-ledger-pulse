import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Percent, Power, PowerOff, X } from 'lucide-react';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';

interface BulkActionToolbarProps {
  selectedAds: BinanceAd[];
  onClearSelection: () => void;
  onBulkEditLimits: () => void;
  onBulkFloatingPrice: () => void;
  onBulkActivate: () => void;
  onBulkDeactivate: () => void;
}

export function BulkActionToolbar({
  selectedAds,
  onClearSelection,
  onBulkEditLimits,
  onBulkFloatingPrice,
  onBulkActivate,
  onBulkDeactivate,
}: BulkActionToolbarProps) {
  const allFloating = selectedAds.every(ad => ad.priceType === 2);
  const hasOnline = selectedAds.some(ad => ad.advStatus === BINANCE_AD_STATUS.ONLINE);
  const hasOffline = selectedAds.some(ad => ad.advStatus !== BINANCE_AD_STATUS.ONLINE);

  return (
    <div className="flex items-center gap-2 flex-wrap bg-muted border border-border rounded-lg px-4 py-2.5">
      <Badge variant="secondary" className="font-medium text-foreground bg-primary/20 border border-primary/30">
        {selectedAds.length} ad{selectedAds.length !== 1 ? 's' : ''} selected
      </Badge>

      <div className="h-4 w-px bg-border mx-1" />

      <Button variant="outline" size="sm" onClick={onBulkEditLimits} className="text-foreground border-border">
        <Edit className="h-3.5 w-3.5 mr-1.5" />
        Edit Order Limits
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onBulkFloatingPrice}
        disabled={!allFloating}
        title={!allFloating ? 'All selected ads must be floating price type' : 'Adjust floating price ratio'}
        className="text-foreground border-border disabled:text-muted-foreground"
      >
        <Percent className="h-3.5 w-3.5 mr-1.5" />
        Adjust Floating %
      </Button>

      {hasOffline && (
        <Button variant="outline" size="sm" onClick={onBulkActivate} className="text-success border-success/30">
          <Power className="h-3.5 w-3.5 mr-1.5" />
          Activate
        </Button>
      )}

      {hasOnline && (
        <Button variant="outline" size="sm" onClick={onBulkDeactivate} className="text-destructive border-destructive/30">
          <PowerOff className="h-3.5 w-3.5 mr-1.5" />
          Deactivate
        </Button>
      )}

      <div className="ml-auto">
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
