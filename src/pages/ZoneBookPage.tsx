import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { ArrowLeft, RefreshCw, ShieldCheck, Boxes } from 'lucide-react';
import { AdZone, ZONE_LABEL, adZone } from '@/lib/adZone';
import { useBinanceAdsList, BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useZoneBook, rankInBook, ZoneBookRow } from '@/hooks/useZoneBook';
import { cn } from '@/lib/utils';

const fmt = (v: unknown, digits = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
};

type BadgeFilter = 'any' | 'block' | 'shield' | 'block_and_shield' | 'ordinary';
type LevelFilter = 'any' | 'BLOCK_MERCHANT' | 'MASS_MERCHANT';

interface BookFilters {
  badge: BadgeFilter;
  level: LevelFilter;
  minVip: number;
  depth: number;
}

const hasBadge = (row: ZoneBookRow, name: string) => {
  const list = (row.badges || []).map((b) => String(b).toLowerCase());
  if (list.includes(name)) return true;
  // Binance sometimes omits the Block badge while flagging the identity.
  if (name === 'block' && row.userIdentity === 'BLOCK_MERCHANT') return true;
  return false;
};

function matchesFilters(row: ZoneBookRow, f: BookFilters): boolean {
  if (f.badge === 'block' && !hasBadge(row, 'block')) return false;
  if (f.badge === 'shield' && !hasBadge(row, 'shield')) return false;
  if (f.badge === 'block_and_shield' && !(hasBadge(row, 'block') && hasBadge(row, 'shield'))) return false;
  if (f.badge === 'ordinary' && (hasBadge(row, 'block') || hasBadge(row, 'shield'))) return false;
  if (f.level !== 'any' && row.userIdentity !== f.level) return false;
  if (f.minVip > 0 && (row.vipLevel ?? 0) < f.minVip) return false;
  return true;
}

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
  zone, asset, side, minAmount, ads, bookFilters,
}: {
  zone: AdZone; asset: string; side: 'BUY' | 'SELL'; minAmount: string;
  ads: BinanceAd[]; bookFilters: BookFilters;
}) {
  const { data, isFetching, refetch, error } = useZoneBook({
    asset, tradeType: side, zone, minAmount: minAmount || null, maxPages: bookFilters.depth,
  });
  const rows = data?.merchants || [];
  const filtered = useMemo(() => rows.filter((r) => matchesFilters(r, bookFilters)), [rows, bookFilters]);

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

  // Rank is computed against the FILTERED book so "our rank among Block+Shield
  // merchants" is answerable, which is the point of the filters.
  const { rank, topPrice, spread } = rankInBook(filtered, ourBest, side);
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (side === 'SELL'
      ? Number(a.price) - Number(b.price)
      : Number(b.price) - Number(a.price))),
    [filtered, side],
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant={zone === 'block' ? 'secondary' : 'outline'} className="text-[10px]">
            {zone === 'block' ? <Boxes className="h-2.5 w-2.5 mr-0.5" /> : null}
            {ZONE_LABEL[zone]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {rows.length} ads
          </span>
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
        <div className="px-3 py-10 text-center text-xs text-destructive">
          Binance returned no usable data for this zone. {(error as Error).message}
        </div>
      ) : sorted.length === 0 ? (
        <div className="px-3 py-10 text-center text-xs text-muted-foreground">
          {isFetching
            ? 'Loading book…'
            : rows.length === 0
              ? 'Binance returned an empty book for this zone / ticket size.'
              : 'No advertiser in this zone matches the selected merchant filters.'}
        </div>
      ) : (
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
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
        </div>
      )}
    </div>
  );
}

export default function ZoneBookPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.pathname.startsWith('/terminal') ? '/terminal/ads' : '/ad-manager';

  const { data } = useBinanceAdsList({ page: 1, rows: 50, fetchAll: true });
  const ads: BinanceAd[] = (data?.data || []) as BinanceAd[];

  const assetOptions = useMemo(
    () => Array.from(new Set(ads.map((a) => a.asset).filter(Boolean))) as string[],
    [ads],
  );
  const [asset, setAsset] = useState<string>('USDT');
  const [side, setSide] = useState<'BUY' | 'SELL'>('SELL');
  const [minAmount, setMinAmount] = useState('');
  const [badge, setBadge] = useState<BadgeFilter>('any');
  const [level, setLevel] = useState<LevelFilter>('any');
  const [minVip, setMinVip] = useState(0);
  const [depth, setDepth] = useState(1);

  const bookFilters: BookFilters = useMemo(
    () => ({ badge, level, minVip, depth }),
    [badge, level, minVip, depth],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Zone Book"
          description="The P2P zone and the Block zone are two separate order books with different top merchants and different price levels. Both columns are live Binance data for the same asset, side and ticket size."
        />
        <Button variant="outline" size="sm" onClick={() => navigate(backTo)} className="shrink-0">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Ads
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Asset</Label>
            <Select value={asset} onValueChange={setAsset}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(assetOptions.length ? Array.from(new Set(['USDT', ...assetOptions])) : ['USDT']).map((a) => (
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
          <div className="space-y-1">
            <Label className="text-xs">Book depth (pages)</Label>
            <Select value={String(depth)} onValueChange={(v) => setDepth(Number(v))}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5].map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} page{d > 1 ? 's' : ''} ({d * 20} ads)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Trust badge</Label>
            <Select value={badge} onValueChange={(v) => setBadge(v as BadgeFilter)}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All advertisers</SelectItem>
                <SelectItem value="block">Block badge</SelectItem>
                <SelectItem value="shield">Shield badge</SelectItem>
                <SelectItem value="block_and_shield">Block + Shield</SelectItem>
                <SelectItem value="ordinary">Ordinary (no badge)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Merchant level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as LevelFilter)}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any level</SelectItem>
                <SelectItem value="BLOCK_MERCHANT">Block merchant</SelectItem>
                <SelectItem value="MASS_MERCHANT">Mass merchant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Minimum VIP level</Label>
            <Select value={String(minVip)} onValueChange={(v) => setMinVip(Number(v))}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any VIP</SelectItem>
                {[1, 2, 3, 4, 5].map((v) => (
                  <SelectItem key={v} value={String(v)}>VIP {v}+</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full"
              onClick={() => { setBadge('any'); setLevel('any'); setMinVip(0); setMinAmount(''); setDepth(1); }}
            >
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ZoneColumn zone="p2p" asset={asset} side={side} minAmount={minAmount} ads={ads} bookFilters={bookFilters} />
        <ZoneColumn zone="block" asset={asset} side={side} minAmount={minAmount} ads={ads} bookFilters={bookFilters} />
      </div>
    </div>
  );
}
