import { useMemo } from 'react';
import { BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';

interface AdSummaryStripProps {
  ads: BinanceAd[];
}

/**
 * Compact, client-side stat chips derived entirely from the fetched ads
 * already in memory — no extra queries. Shows status counts, total ads,
 * and per-asset total surplus for the top 3 assets.
 */
export function AdSummaryStrip({ ads }: AdSummaryStripProps) {
  const stats = useMemo(() => {
    let online = 0, priv = 0, offline = 0;
    const surplusByAsset = new Map<string, number>();
    for (const ad of ads) {
      if (ad.advStatus === BINANCE_AD_STATUS.ONLINE) online++;
      else if (ad.advStatus === BINANCE_AD_STATUS.PRIVATE) priv++;
      else if (ad.advStatus === BINANCE_AD_STATUS.OFFLINE) offline++;
      const asset = ad.asset || '—';
      surplusByAsset.set(asset, (surplusByAsset.get(asset) || 0) + Number(ad.surplusAmount || 0));
    }
    const topAssets = [...surplusByAsset.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { online, priv, offline, total: ads.length, topAssets };
  }, [ads]);

  if (!ads.length) return null;

  const chip = (label: string, value: string, tone?: string) => (
    <div key={label} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone || 'text-foreground'}`}>{value}</span>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip('Total', String(stats.total))}
      {chip('Online', String(stats.online), 'text-success')}
      {chip('Private', String(stats.priv), 'text-warning')}
      {chip('Offline', String(stats.offline), 'text-muted-foreground')}
      {stats.topAssets.map(([asset, surplus]) =>
        chip(`${asset} surplus`, surplus.toLocaleString('en-IN', { maximumFractionDigits: 2 }))
      )}
    </div>
  );
}
