import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, ShieldCheck, Boxes } from 'lucide-react';
import { AdZone, ZONE_LABEL, adZone } from '@/lib/adZone';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useZoneBook, rankInBook, ZoneBookRow } from '@/hooks/useZoneBook';
import { cn } from '@/lib/utils';

interface ZoneBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Our own ads, used to place our price inside each zone's book. */
  ads: BinanceAd[];
}

const fmt = (v: unknown, digits = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
};

function MerchantBadges({ row }: { row: ZoneBookRow }) {
  const badges = row.badges || [];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {badges.map((b) => (
        <Badge key={b} variant="outline" className="text-[10px] px-1 py-0">
          {b === 'Shield' ? <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> : null}
          {b}
        </Badge>
      ))}
      {row.userIdentity === 'BLOCK_MERCHANT' && !badges.includes('Block') && (
        <Badge variant="outline" className="text-[10px] px-1 py-0">Block</Badge>
      )}
      {row.vipLevel != null && row.vipLevel > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1 py-0">VIP {row.vipLevel}</Badge>
      )}
    </span>
  );
}

function ZoneColumn({
  zone, asset, side, minAmount, ads,
}: { zone: AdZone; asset: string; side: 'BUY' | 'SELL'; minAmount: string; ads: BinanceAd[] }) {
  const { data, isFetching, refetch, error } = useZoneBook({
    asset, tradeType: side, zone, minAmount: minAmount || null,
  });
  const rows = data?.merchants || [];

  // Our live ads in this zone / asset / side (online only — offline ads are not in the book).
  const ourAds = useMemo(
    () => ads.filter((a) =>
      a.asset === asset &&
      a.tradeType === side &&
      adZone(a) === zone &&
      a.advStatus === BINANCE_AD_STATUS.ONLINE),
    [ads, asset, side, zone],
  );
  const ourBest = useMemo(() => {
    const prices = ourAds.map((a) => Number(a.price)).filter((n) => Number.isFinite(n) && n > 0);
    if (!prices.length) return null;
    return side === 'SELL' ? Math.min(...prices) : Math.max(...prices);
  }, [ourAds, side]);

  const { rank, topPrice, spread } = rankInBook(rows, ourBest, side);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (side === 'SELL'
      ? Number(a.price) - Number(b.price)
      : Number(b.price) - Number(a.price))),
    [rows, side],
  );

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant={zone === 'block' ? 'secondary' : 'outline'} className="text-[10px]">
            {zone === 'block' ? <Boxes className="h-2.5 w-2.5 mr-0.5" /> : null}
            {ZONE_LABEL[zone]}
          </Badge>
          <span className="text-xs text-muted-foreground">{rows.length} ads</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} disabled={isFetching} title="Refresh book">
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b px-3 py-2 text-xs">
        <div>
          <div className="text-muted-foreground">Top price</div>
          <div className="t-mono font-medium">{topPrice != null ? `₹${fmt(topPrice)}` : '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Our best</div>
          <div className="t-mono font-medium">{ourBest != null ? `₹${fmt(ourBest)}` : 'no live ad'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Our rank / spread</div>
          <div className="t-mono font-medium">
            {rank != null ? `#${rank}` : '—'}
            {spread != null ? <span className="ml-1 text-muted-foreground">({spread > 0 ? '+' : ''}{fmt(spread)})</span> : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="px-3 py-8 text-center text-xs text-destructive">
          Binance returned no usable data for this zone. {(error as Error).message}
        </div>
      ) : sorted.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
          {isFetching ? 'Loading book…' : 'Binance returned an empty book for this zone / ticket size.'}
        </div>
      ) : (
        <ScrollArea className="h-[360px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Merchant</th>
                <th className="px-2 py-1.5 text-right font-medium">Price</th>
                <th className="px-2 py-1.5 text-right font-medium">Limits</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const isOurs = ourBest != null && Number(row.price) === ourBest;
                return (
                  <tr key={`${row.userNo || row.nickName || i}-${i}`} className={cn('border-b last:border-0', isOurs && 'bg-primary/5')}>
                    <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{row.nickName || '—'}</span>
                        {row.isOnline ? <span className="h-1.5 w-1.5 rounded-full bg-success" /> : null}
                      </div>
                      <MerchantBadges row={row} />
                    </td>
                    <td className="px-2 py-1.5 text-right t-mono">₹{fmt(row.price)}</td>
                    <td className="px-2 py-1.5 text-right t-mono text-muted-foreground">
                      {fmt(row.minSingleTransAmount, 0)}–{fmt(row.maxSingleTransAmount, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}

export function ZoneBookDialog({ open, onOpenChange, ads }: ZoneBookDialogProps) {
  const assetOptions = useMemo(
    () => Array.from(new Set(ads.map((a) => a.asset).filter(Boolean))) as string[],
    [ads],
  );
  const [asset, setAsset] = useState<string>(assetOptions[0] || 'USDT');
  const [side, setSide] = useState<'BUY' | 'SELL'>('SELL');
  const [minAmount, setMinAmount] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Zone Book</DialogTitle>
          <DialogDescription>
            The P2P zone and the Block zone are two separate order books with different top
            merchants and different price levels. Both columns are live Binance data for the
            same asset, side and ticket size.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Asset</Label>
            <Select value={asset} onValueChange={setAsset}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(assetOptions.length ? assetOptions : ['USDT']).map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Our side</Label>
            <Select value={side} onValueChange={(v) => setSide(v as 'BUY' | 'SELL')}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SELL">Sell (we sell)</SelectItem>
                <SelectItem value="BUY">Buy (we buy)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ticket size (₹, optional)</Label>
            <Input
              inputMode="decimal"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="e.g. 500000"
              className="h-9 text-foreground"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ZoneColumn zone="p2p" asset={asset} side={side} minAmount={minAmount} ads={ads} />
          <ZoneColumn zone="block" asset={asset} side={side} minAmount={minAmount} ads={ads} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
