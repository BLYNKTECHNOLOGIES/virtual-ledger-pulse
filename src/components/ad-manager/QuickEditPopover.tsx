import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { BinanceAd, useUpdateAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';

const changedNumber = (current: unknown, next: unknown) => Number(current ?? 0) !== Number(next ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

interface QuickEditPopoverProps {
  ad: BinanceAd;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

/**
 * Quick Edit — routine edits (price/ratio, order limits, status) without the
 * full 1001-line dialog. Save = ONE useUpdateAd call, payload built exactly as
 * CreateEditAdDialog's edit path (only changed fields, same Private→Online map,
 * same changedNumber diffing). No other fields, no automation.
 */
export function QuickEditPopover({ ad, children, align = 'end' }: QuickEditPopoverProps) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();
  const [open, setOpen] = useState(false);
  const isFloating = ad.priceType === 2;

  const [price, setPrice] = useState('');
  const [ratio, setRatio] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [status, setStatus] = useState<number>(BINANCE_AD_STATUS.ONLINE);

  useEffect(() => {
    if (!open) return;
    setPrice(String(ad.price || ''));
    setRatio(String(ad.priceFloatingRatio || ''));
    setMinAmt(String(ad.minSingleTransAmount || ''));
    setMaxAmt(String(ad.maxSingleTransAmount || ''));
    setStatus(ad.advStatus || BINANCE_AD_STATUS.ONLINE);
  }, [open, ad]);

  const handleSave = () => {
    // Same field rules the dialog applies to these fields.
    if (!minAmt || Number(minAmt) <= 0) { toast({ title: 'Validation Error', description: 'Min order limit is required', variant: 'destructive' }); return; }
    if (!maxAmt || Number(maxAmt) <= 0) { toast({ title: 'Validation Error', description: 'Max order limit is required', variant: 'destructive' }); return; }
    if (Number(minAmt) >= Number(maxAmt)) { toast({ title: 'Validation Error', description: 'Min order must be less than max order', variant: 'destructive' }); return; }
    if (!isFloating && (!price || Number(price) <= 0)) { toast({ title: 'Validation Error', description: 'Price is required', variant: 'destructive' }); return; }
    if (isFloating && (!ratio || Number(ratio) === 0)) { toast({ title: 'Validation Error', description: 'Floating ratio is required', variant: 'destructive' }); return; }

    // Private (2) maps back to Binance online (1); visibility handled by edge fn.
    const binanceAdvStatus = status === BINANCE_AD_STATUS.PRIVATE ? BINANCE_AD_STATUS.ONLINE : status;

    const adData: Record<string, any> = { advNo: ad.advNo };
    if (ad._exchangeAccountId) adData.exchange_account_id = ad._exchangeAccountId;
    // Log context (audits like a dialog edit).
    adData.asset = ad.asset;
    adData.tradeType = ad.tradeType;
    adData.priceType = ad.priceType;

    if (changedNumber(ad.minSingleTransAmount, minAmt)) adData.minSingleTransAmount = Number(minAmt);
    if (changedNumber(ad.maxSingleTransAmount, maxAmt)) adData.maxSingleTransAmount = Number(maxAmt);
    if (!isFloating && changedNumber(ad.price, price)) { adData.price = round2(Number(price)); adData.oldPrice = round2(Number(ad.price || 0)); }
    if (isFloating && changedNumber(ad.priceFloatingRatio, ratio)) { adData.priceFloatingRatio = Number(ratio); adData.oldRatio = Number(ad.priceFloatingRatio || 0); }
    if (changedNumber(ad.advStatus, binanceAdvStatus)) adData.advStatus = binanceAdvStatus;

    // Nothing changed beyond context → just close.
    const hasChange = ['minSingleTransAmount', 'maxSingleTransAmount', 'price', 'priceFloatingRatio', 'advStatus'].some((k) => k in adData);
    if (!hasChange) { setOpen(false); return; }

    updateAd.mutate(adData, { onSuccess: () => setOpen(false) });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-semibold text-foreground">Quick Edit</div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isFloating ? 'Floating Ratio (%)' : 'Price (₹)'}</Label>
          {isFloating ? (
            <Input type="number" step="0.01" value={ratio} onChange={(e) => setRatio(e.target.value)} className="h-8 tabular-nums text-foreground" />
          ) : (
            <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="h-8 tabular-nums text-foreground" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min (₹)</Label>
            <Input type="number" min="0" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} className="h-8 tabular-nums text-foreground" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max (₹)</Label>
            <Input type="number" min="0" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} className="h-8 tabular-nums text-foreground" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={String(status)} onValueChange={(v) => setStatus(Number(v))}>
            <SelectTrigger className="h-8 text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={String(BINANCE_AD_STATUS.ONLINE)}>Active</SelectItem>
              <SelectItem value={String(BINANCE_AD_STATUS.PRIVATE)}>Private</SelectItem>
              <SelectItem value={String(BINANCE_AD_STATUS.OFFLINE)}>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setOpen(false)} disabled={updateAd.isPending}>Cancel</Button>
          <Button size="sm" className="h-8" onClick={handleSave} disabled={updateAd.isPending}>
            {updateAd.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
